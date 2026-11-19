// DB 테이블 모양을 TypeScript 로 적어둔 파일. supabase/migrations/001_init.sql 과 반드시 같아야 한다.
// 수정은 팀장(A)만. 스키마를 바꾸면 이 파일도 함께 바꾼다.
//
// 자주 쓰는 모양은 맨 아래에 짧은 이름으로 꺼내 두었다:
//   import type { Message, Channel } from "@/types/database";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChannelType = "public" | "private" | "dm";
export type MemberRole = "admin" | "member";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          name?: string;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          name: string;
          type: ChannelType;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: ChannelType;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: ChannelType;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channels_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_members: {
        Row: {
          channel_id: string;
          user_id: string;
          role: MemberRole;
          last_read_message_id: number | null;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          role?: MemberRole;
          last_read_message_id?: number | null;
        };
        Update: {
          channel_id?: string;
          user_id?: string;
          role?: MemberRole;
          last_read_message_id?: number | null;
        };
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
        Row: {
          id: number;
          client_id: string;
          channel_id: string;
          user_id: string;
          parent_id: number | null;
          content: string;
          created_at: string;
        };
        Insert: {
          // id 는 DB 가 자동으로 매기므로 넣지 않는다
          client_id: string;
          channel_id: string;
          user_id: string;
          parent_id?: number | null;
          content?: string;
          created_at?: string;
        };
        Update: {
          client_id?: string;
          channel_id?: string;
          user_id?: string;
          parent_id?: number | null;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          id: string;
          message_id: number;
          file_url: string;
          file_name: string;
        };
        Insert: {
          id?: string;
          message_id: number;
          file_url: string;
          file_name: string;
        };
        Update: {
          id?: string;
          message_id?: number;
          file_url?: string;
          file_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_channel_member: { Args: { cid: string }; Returns: boolean };
      is_channel_admin: { Args: { cid: string }; Returns: boolean };
      can_add_channel_member: { Args: { cid: string; uid: string }; Returns: boolean };
      can_access_attachment_path: { Args: { path: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// ---- 짧은 이름 (조회 결과 한 줄의 모양) ----
type Tables = Database["public"]["Tables"];

export type Profile = Tables["profiles"]["Row"];
export type Channel = Tables["channels"]["Row"];
export type ChannelMember = Tables["channel_members"]["Row"];
export type Message = Tables["messages"]["Row"];
export type Attachment = Tables["attachments"]["Row"];

export type NewMessage = Tables["messages"]["Insert"];
