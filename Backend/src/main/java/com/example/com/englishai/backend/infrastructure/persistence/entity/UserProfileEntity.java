package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.profile.AvatarType;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.profile.LearningGoal;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity @Table(name="user_profiles")
public class UserProfileEntity {
    @Id @Column(name="user_id") private UUID userId;
    @Column(name="preferred_name", length=100) private String preferredName;
    private Integer age;
    @Enumerated(EnumType.STRING) @Column(name="english_level", length=2) private EnglishLevel englishLevel;
    @Enumerated(EnumType.STRING) @Column(name="learning_goal", length=32) private LearningGoal learningGoal;
    @Enumerated(EnumType.STRING) @Column(name="avatar_type", nullable=false, length=16) private AvatarType avatarType = AvatarType.PREDEFINED;
    @Column(name="avatar_key", length=128) private String avatarKey;
    @Column(name="onboarding_completed", nullable=false) private boolean onboardingCompleted;
    @Column(name="created_at", nullable=false) private OffsetDateTime createdAt;
    @Column(name="updated_at", nullable=false) private OffsetDateTime updatedAt;
    protected UserProfileEntity() {}
    public UserProfileEntity(UUID userId, String preferredName, Integer age, EnglishLevel level, LearningGoal goal,
                             AvatarType avatarType, String avatarKey, boolean completed, OffsetDateTime now) {
        this.userId=userId; this.preferredName=preferredName; this.age=age; this.englishLevel=level; this.learningGoal=goal;
        this.avatarType=avatarType == null ? AvatarType.PREDEFINED : avatarType; this.avatarKey=avatarKey;
        this.onboardingCompleted=completed; this.createdAt=now; this.updatedAt=now;
    }
    public UUID getUserId(){return userId;} public String getPreferredName(){return preferredName;} public Integer getAge(){return age;}
    public EnglishLevel getEnglishLevel(){return englishLevel;} public LearningGoal getLearningGoal(){return learningGoal;}
    public AvatarType getAvatarType(){return avatarType;} public String getAvatarKey(){return avatarKey;}
    public boolean isOnboardingCompleted(){return onboardingCompleted;} public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getUpdatedAt(){return updatedAt;}
    public void update(String name,Integer age,EnglishLevel level,LearningGoal goal,boolean completed,OffsetDateTime now){this.preferredName=name;this.age=age;this.englishLevel=level;this.learningGoal=goal;this.onboardingCompleted=completed;this.updatedAt=now;}
    public void setAvatar(AvatarType type,String key,OffsetDateTime now){this.avatarType=type;this.avatarKey=key;this.updatedAt=now;}
}
