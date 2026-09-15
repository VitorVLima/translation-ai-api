CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_name VARCHAR(100),
    age INTEGER,
    english_level VARCHAR(2),
    learning_goal VARCHAR(32),
    avatar_type VARCHAR(16) NOT NULL DEFAULT 'PREDEFINED',
    avatar_key VARCHAR(128),
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_profile_age CHECK (age IS NULL OR (age >= 13 AND age <= 120)),
    CONSTRAINT ck_profile_level CHECK (english_level IS NULL OR english_level IN ('A1','A2','B1','B2','C1','C2')),
    CONSTRAINT ck_profile_goal CHECK (learning_goal IS NULL OR learning_goal IN ('GENERAL','CONVERSATION','WORK','TRAVEL','STUDY')),
    CONSTRAINT ck_profile_avatar_type CHECK (avatar_type IN ('PREDEFINED','CUSTOM'))
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario VARCHAR(32) NOT NULL,
    language VARCHAR(2) NOT NULL,
    title VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_conversation_language CHECK (language IN ('pt','en')),
    CONSTRAINT ck_conversation_scenario CHECK (scenario IN ('FREE_TALK','JOB_INTERVIEW','FRIENDS','SELF_INTRODUCTION','RESTAURANT','TRAVEL'))
);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    corrected_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_conversation_message_role CHECK (role IN ('USER','ASSISTANT'))
);
CREATE INDEX idx_conversation_messages_conversation_created ON conversation_messages(conversation_id, created_at);
