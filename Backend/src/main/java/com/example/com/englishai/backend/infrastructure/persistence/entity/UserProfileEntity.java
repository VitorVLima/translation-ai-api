package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.profile.AvatarType;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.profile.LearningGoal;
import com.example.com.englishai.backend.application.profile.OnboardingStatus;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity @Table(name="user_profiles")
public class UserProfileEntity {
    @Id @Column(name="user_id") private UUID userId;
    @Column(name="preferred_name", length=100) private String preferredName;
    @Column(name="birth_date") private LocalDate birthDate;
    @Enumerated(EnumType.STRING) @Column(name="english_level", length=2) private EnglishLevel englishLevel;
    @Enumerated(EnumType.STRING) @Column(name="learning_goal", length=32) private LearningGoal learningGoal;
    @Enumerated(EnumType.STRING) @Column(name="avatar_type", nullable=false, length=16) private AvatarType avatarType = AvatarType.PREDEFINED;
    @Column(name="avatar_key", length=128) private String avatarKey;
    @Enumerated(EnumType.STRING) @Column(name="onboarding_status", nullable=false, length=16) private OnboardingStatus onboardingStatus = OnboardingStatus.PENDING;
    @Column(name="created_at", nullable=false) private OffsetDateTime createdAt;
    @Column(name="updated_at", nullable=false) private OffsetDateTime updatedAt;
    protected UserProfileEntity() {}
    public UserProfileEntity(UUID userId, String preferredName, LocalDate birthDate, EnglishLevel level, LearningGoal goal,
                             AvatarType avatarType, String avatarKey, OnboardingStatus onboardingStatus, OffsetDateTime now) {
        this.userId=userId; this.preferredName=preferredName; this.birthDate=birthDate; this.englishLevel=level; this.learningGoal=goal;
        this.avatarType=avatarType == null ? AvatarType.PREDEFINED : avatarType; this.avatarKey=avatarKey;
        this.onboardingStatus=onboardingStatus == null ? OnboardingStatus.PENDING : onboardingStatus; this.createdAt=now; this.updatedAt=now;
    }
    public UUID getUserId(){return userId;} public String getPreferredName(){return preferredName;} public LocalDate getBirthDate(){return birthDate;}
    public EnglishLevel getEnglishLevel(){return englishLevel;} public LearningGoal getLearningGoal(){return learningGoal;}
    public AvatarType getAvatarType(){return avatarType;} public String getAvatarKey(){return avatarKey;}
    public OnboardingStatus getOnboardingStatus(){return onboardingStatus;} public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getUpdatedAt(){return updatedAt;}
    public void update(String name,LocalDate birthDate,EnglishLevel level,LearningGoal goal,OffsetDateTime now){this.preferredName=name;this.birthDate=birthDate;this.englishLevel=level;this.learningGoal=goal;this.updatedAt=now;}
    public void setAvatar(AvatarType type,String key,OffsetDateTime now){this.avatarType=type;this.avatarKey=key;this.updatedAt=now;}
    public void setOnboardingStatus(OnboardingStatus status,OffsetDateTime now){this.onboardingStatus=status;this.updatedAt=now;}
}
