import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadioView } from "./radio-view";
import { requireUser } from "@/lib/auth";
import { isLiveKitConfigured } from "@/lib/livekit";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rádio" };

export default async function RadioChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const supabase = await getServerSupabase();
  const { data: channel } = await supabase
    .from("channels")
    .select("id, slug, name, description, icon, color, status, is_emergency, has_voice_room")
    .eq("slug", slug)
    .maybeSingle();
  if (!channel || !channel.has_voice_room) notFound();

  return (
    <RadioView
      channel={channel}
      me={{ id: user.id, name: user.fullName }}
      configured={isLiveKitConfigured()}
    />
  );
}
