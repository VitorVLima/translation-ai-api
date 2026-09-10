package com.example.com.englishai.backend.domain.authentication;
import java.time.OffsetDateTime; import java.util.UUID;
public class PasswordResetCode {
 private final UUID id,userId; private final String codeHash; private final OffsetDateTime createdAt,expiresAt,usedAt,invalidatedAt; private final int attempts,maxAttempts;
 public PasswordResetCode(UUID id,UUID userId,String hash,OffsetDateTime created,OffsetDateTime expires,OffsetDateTime used,OffsetDateTime invalidated,int attempts,int max){if(attempts<0||max<=0||attempts>max)throw new IllegalArgumentException("Invalid password reset attempts");this.id=id;this.userId=userId;codeHash=hash;createdAt=created;expiresAt=expires;usedAt=used;invalidatedAt=invalidated;this.attempts=attempts;maxAttempts=max;}
 public UUID getId(){return id;} public UUID getUserId(){return userId;} public String getCodeHash(){return codeHash;} public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getExpiresAt(){return expiresAt;} public OffsetDateTime getUsedAt(){return usedAt;} public OffsetDateTime getInvalidatedAt(){return invalidatedAt;} public int getAttempts(){return attempts;} public int getMaxAttempts(){return maxAttempts;}
 public PasswordResetCode invalidate(OffsetDateTime at){return new PasswordResetCode(id,userId,codeHash,createdAt,expiresAt,usedAt,at,attempts,maxAttempts);}
 public PasswordResetCode incrementAttempts(){return new PasswordResetCode(id,userId,codeHash,createdAt,expiresAt,usedAt,invalidatedAt,attempts+1,maxAttempts);}
 public PasswordResetCode markUsed(OffsetDateTime at){return new PasswordResetCode(id,userId,codeHash,createdAt,expiresAt,at,invalidatedAt,attempts,maxAttempts);}
 @Override public String toString(){return "PasswordResetCode[id="+id+", userId="+userId+", createdAt="+createdAt+", expiresAt="+expiresAt+", attempts="+attempts+", codeHash=[REDACTED]]";}
}
