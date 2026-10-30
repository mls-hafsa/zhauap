import io


def upload(client, path, content, filename="catalog.csv"):
    data = {"file": (io.BytesIO(content), filename)}
    return client.post(path, data=data, content_type="multipart/form-data")


def services(client):
    return {s["name"]: s for s in client.get("/api/services").get_json()}


def test_csv_comma(client, owner):
    response = upload(client, "/api/products/upload-csv", b"name,price,stock\nLatte,1500,10\nTea,800,\n")
    body = response.get_json()
    assert response.status_code == 200 and body["report"]["created"] == 2
    items = services(client)
    assert items["Latte"]["stock"] == "10"
    assert items["Tea"]["stock"] == ""  # остаток не выдуман


def test_csv_semicolon_cp1251_russian_headers(client, owner):
    content = "Название;Цена;Остаток\nКапучино;1 200 ₸;5\nЧизкейк;2 000;\n".encode("cp1251", errors="replace")
    content = "Название;Цена;Остаток\nКапучино;1 200 тг;5\nЧизкейк;2 000;\n".encode("cp1251")
    response = upload(client, "/api/products/upload-csv", content)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["report"]["delimiter"] == ";"
    items = services(client)
    assert items["Капучино"]["price"] == "1 200 тг" and items["Капучино"]["stock"] == "5"


def test_csv_reimport_updates_instead_of_duplicating(client, owner):
    upload(client, "/api/products/upload-csv", b"name,price,stock\nLatte,1500,10\n")
    response = upload(client, "/api/products/upload-csv", b"name,price\nlatte ,1700\nMocha,1900\n")
    report = response.get_json()["report"]
    assert report["updated"] == 1 and report["created"] == 1
    items = services(client)
    assert len(items) == 2
    assert items["latte"]["price"] == "1700"
    assert items["latte"]["stock"] == "10"  # остаток не затёрт, т.к. столбца не было


def test_csv_report_lists_bad_rows(client, owner):
    content = b"name,price,stock\nGood,100,1\n,200,\nNoPrice,,\nBadStock,300,-5\nGood,150,\n"
    report = upload(client, "/api/products/upload-csv", content).get_json()["report"]
    assert report["created"] == 1 and report["skipped"] == 4
    reasons = {e["row"]: e["reason"] for e in report["errors"]}
    assert "название" in reasons[3].lower() and "цену" in reasons[4]
    assert "Остаток" in reasons[5] and "уже встречался" in reasons[6]


def test_csv_zero_rows_is_error_not_success(client, owner):
    response = upload(client, "/api/products/upload-csv", b"name,price\n,\n")
    assert response.status_code == 400
    response = upload(client, "/api/products/upload-csv", b"foo,bar\n1,2\n")
    assert response.status_code == 400 and "обязательные столбцы" in response.get_json()["error"]
    assert upload(client, "/api/products/upload-csv", b"").status_code == 400


def test_csv_size_limit(client, owner):
    big = b"name,price\n" + b"x,1\n" * (600 * 1024)
    assert upload(client, "/api/products/upload-csv", big).status_code == 413


def test_service_crud_validation(client, owner):
    assert client.post("/api/services", json={"name": "Торт", "price": "abc"}).status_code == 400
    assert client.post("/api/services", json={"name": "Торт", "price": "5000", "stock": "два"}).status_code == 400
    created = client.post("/api/services", json={"name": "Торт", "price": "5000"})
    assert created.status_code == 201
    assert client.post("/api/services", json={"name": "ТОРТ", "price": "1"}).status_code == 409
    other = client.post("/api/services", json={"name": "Пирог", "price": "3000"}).get_json()["id"]
    assert client.patch(f"/api/services/{other}", json={"name": "торт"}).status_code == 409
    assert client.patch(f"/api/services/{other}", json={"stock": "7"}).status_code == 200
    assert client.patch("/api/services/not-an-id", json={"stock": "7"}).status_code == 400


def test_knowledge_base_crud_and_csv(client, owner):
    assert client.post("/api/knowledge-base", json={"question": "Адрес?", "answer": "Абая 1"}).status_code == 201
    assert client.post("/api/knowledge-base", json={"question": "адрес", "answer": "x"}).status_code == 409
    item_id = client.get("/api/knowledge-base").get_json()[0]["_id"]
    assert client.patch(f"/api/knowledge-base/{item_id}", json={"answer": "Абая 2"}).status_code == 200
    response = upload(
        client, "/api/knowledge-base/upload-csv", "Вопрос;Ответ\nАдрес?;Абая 3\nГрафик?;9-18\n".encode()
    )
    report = response.get_json()["report"]
    assert report["updated"] == 1 and report["created"] == 1
    answers = {i["question"]: i["answer"] for i in client.get("/api/knowledge-base").get_json()}
    assert answers["Адрес?"] == "Абая 3"


def test_business_profile(client, owner):
    response = client.patch(
        "/api/settings/business",
        json={"business_name": "Новая кофейня", "hours": "9-18", "tone": "Деловой", "onboarding_completed": True},
    )
    assert response.status_code == 200
    profile = client.get("/api/settings/business").get_json()
    assert profile["business_name"] == "Новая кофейня" and profile["hours"] == "9-18"
    assert client.get("/api/me").get_json()["onboarding_completed"] is True
    assert client.patch("/api/settings/business", json={"business_name": ""}).status_code == 400


def test_payment_settings_validate_qr(client, owner):
    assert client.patch("/api/settings/payment", json={"payment_qr": "javascript:alert(1)"}).status_code == 400
    png = "data:image/png;base64,iVBORw0KGgo="
    assert client.patch("/api/settings/payment", json={"payment_qr": png, "payment_info": "Kaspi"}).status_code == 200
    assert client.get("/api/settings/payment").get_json()["payment_qr"] == png
