// DB 테이블 모양을 TypeScript 로 적어둔 파일. supabase/migrations/ 의 SQL 과 반드시 같아야 한다.
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
          // 005: 내용이 바뀐 시각 (트리거가 자동 기록, null 이면 수정 안 됨)
          edited_at: string | null;
          // 005: 삭제된 시각 (null 이 아니면 "삭제된 메시지입니다", content 는 '')
          deleted_at: string | null;
        };
        Insert: {
          // id 는 DB 가 자동으로 매기므로 넣지 않는다
          client_id: string;
          channel_id: string;
          user_id: string;
          parent_id?: number | null;
          content?: string;
          created_at?: string;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          client_id?: string;
          channel_id?: string;
          user_id?: string;
          parent_id?: number | null;
          content?: string;
          created_at?: string;
          // edited_at·deleted_at 은 화면에서 직접 바꾸지 않는다 (트리거·soft_delete_message 가 처리)
          edited_at?: string | null;
          deleted_at?: string | null;
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
      // 서비스 관리자 목록 (002_roles.sql). 화면에서는 읽기만 가능, 추가·삭제는 SQL Editor 로만.
      app_admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
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
      reactions: {
        Row: {
          message_id: number;
          user_id: string;
          emoji: string;
          channel_id: string;
          created_at: string;
        };
        Insert: {
          message_id: number;
          user_id?: string; // 비우면 DB 가 auth.uid() 로 채움
          emoji: string;
          channel_id?: string; // 비우면 트리거가 메시지의 채널로 채움
          created_at?: string;
        };
        Update: {
          message_id?: number;
          user_id?: string;
          emoji?: string;
          channel_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      // AI 업체 선택 (007_ai_settings.sql). 한 줄뿐. 읽기는 로그인 사용자 누구나, 바꾸기는 admin_set_ai_settings 로만.
      // API 키는 여기 없다 (Vercel 환경변수에만).
      ai_settings: {
        Row: {
          id: boolean;
          ai_provider: "exaone" | "gemini" | null; // null = 환경변수(AI_PROVIDER) 따르기
          gemini_model: string | null; // null = 기본 모델
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          ai_provider?: "exaone" | "gemini" | null;
          gemini_model?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          ai_provider?: "exaone" | "gemini" | null;
          gemini_model?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_channel_member: { Args: { cid: string }; Returns: boolean };
      is_channel_admin: { Args: { cid: string }; Returns: boolean };
      can_add_channel_member: { Args: { cid: string; uid: string }; Returns: boolean };
      // 002_roles.sql
      is_app_admin: { Args: Record<string, never>; Returns: boolean };
      can_manage_channel: { Args: { cid: string }; Returns: boolean };
      can_access_attachment_path: { Args: { path: string }; Returns: boolean };
      // 003_admin.sql (서비스 관리자만 호출 가능, 아니면 에러)
      admin_list_users: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          email: string;
          created_at: string;
          is_app_admin: boolean;
        }[];
      };
      admin_set_app_admin: { Args: { uid: string; make_admin: boolean }; Returns: undefined };
      admin_list_channels: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
          member_count: number;
        }[];
      };
      // 005_message_edit_delete.sql (본인 또는 채널 관리자, DM 은 본인만)
      soft_delete_message: { Args: { mid: number }; Returns: undefined };
      // 007_ai_settings.sql (서비스 관리자만, 아니면 에러). provider null = 환경변수 따르기
      admin_set_ai_settings: {
        Args: { provider: "exaone" | "gemini" | null; model?: string | null };
        Returns: Database["public"]["Tables"]["ai_settings"]["Row"];
      };
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
export type AppAdmin = Tables["app_admins"]["Row"];
export type Reaction = Tables["reactions"]["Row"];
export type AiSettings = Tables["ai_settings"]["Row"];

export type NewMessage = Tables["messages"]["Insert"];
