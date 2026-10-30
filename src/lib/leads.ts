import { Instagram, MessageCircle, MessageSquare, Send } from "lucide-react";
import type { ChannelName } from "./chat-utils";

export { channelOf, statusKind, formatTime, type ChannelName, type StatusKind } from "./chat-utils";

export function channelIcon(channel: ChannelName) {
  if (channel === "Instagram") return Instagram;
  if (channel === "WhatsApp") return MessageCircle;
  if (channel === "Telegram") return Send;
  return MessageSquare;
}
