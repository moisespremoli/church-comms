// Tipos da base de dados (formato do `supabase gen types typescript`).
// Escritos à mão a partir de supabase/migrations; depois de ligar o projeto,
// podem ser regenerados com:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "coordinator" | "member";
export type ChannelStatus = "active" | "archived";
export type ChannelMemberRole = "lead" | "member";
export type MessageKind = "text" | "quick" | "system";

type Timestamps = { created_at: string };

export type ProfileRow = Timestamps & {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: AppRole;
  is_active: boolean;
  updated_at: string;
};

export type TeamRow = Timestamps & {
  id: string;
  name: string;
  description: string;
  color: string;
  updated_at: string;
};

export type TeamMemberRow = Timestamps & {
  team_id: string;
  user_id: string;
  is_lead: boolean;
};

export type ChannelRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: ChannelStatus;
  is_emergency: boolean;
  has_voice_room: boolean;
  sort_order: number;
  created_by: string | null;
  updated_at: string;
};

export type ChannelMemberRow = {
  channel_id: string;
  user_id: string;
  member_role: ChannelMemberRole;
  can_post: boolean;
  last_read_at: string;
  joined_at: string;
};

export type MessageRow = Timestamps & {
  id: string;
  channel_id: string;
  author_id: string | null;
  client_id: string;
  body: string;
  kind: MessageKind;
  reply_to_id: string | null;
};

export type ActivityLogRow = Timestamps & {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Optional<ProfileRow, "full_name" | "avatar_url" | "role" | "is_active" | "created_at" | "updated_at">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      teams: {
        Row: TeamRow;
        Insert: Optional<TeamRow, "id" | "description" | "color" | "created_at" | "updated_at">;
        Update: Partial<TeamRow>;
        Relationships: [];
      };
      team_members: {
        Row: TeamMemberRow;
        Insert: Optional<TeamMemberRow, "is_lead" | "created_at">;
        Update: Partial<TeamMemberRow>;
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      channels: {
        Row: ChannelRow;
        Insert: Optional<
          ChannelRow,
          | "id"
          | "description"
          | "icon"
          | "color"
          | "status"
          | "is_emergency"
          | "has_voice_room"
          | "sort_order"
          | "created_by"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<ChannelRow>;
        Relationships: [];
      };
      channel_members: {
        Row: ChannelMemberRow;
        Insert: Optional<ChannelMemberRow, "member_role" | "can_post" | "last_read_at" | "joined_at">;
        Update: Partial<ChannelMemberRow>;
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: MessageRow;
        Insert: Optional<MessageRow, "id" | "author_id" | "kind" | "reply_to_id" | "created_at">;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_logs: {
        Row: ActivityLogRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      send_message: {
        Args: {
          p_channel_id: string;
          p_client_id: string;
          p_body: string;
          p_kind?: MessageKind;
          p_reply_to_id?: string | null;
        };
        Returns: MessageRow;
      };
      mark_channel_read: {
        Args: { p_channel_id: string };
        Returns: string | null;
      };
      get_unread_counts: {
        Args: Record<string, never>;
        Returns: { channel_id: string; unread: number; last_message_at: string | null }[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      app_role: AppRole;
      channel_status: ChannelStatus;
      channel_member_role: ChannelMemberRole;
      message_kind: MessageKind;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
