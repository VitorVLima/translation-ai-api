package com.example.com.englishai.backend.application.profile;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity; import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository; import org.springframework.stereotype.Service; import org.springframework.transaction.annotation.Transactional; import java.time.OffsetDateTime; import java.time.ZoneOffset; import java.util.UUID;
@Service public class ProfileService {
 private final UserProfileJpaRepository repo; public ProfileService(UserProfileJpaRepository repo){this.repo=repo;}
 @Transactional(readOnly=true) public UserProfileEntity get(UUID userId){return repo.findById(userId).orElse(null);}
 public UserLearningContext context(UUID userId){var p=get(userId);return p==null?new UserLearningContext(null,null,null,null):new UserLearningContext(p.getPreferredName(),p.getAge(),p.getEnglishLevel(),p.getLearningGoal());}
 @Transactional public UserProfileEntity update(UUID userId,String name,Integer age,EnglishLevel level,LearningGoal goal){
  var now=OffsetDateTime.now(ZoneOffset.UTC); var p=repo.findById(userId).orElseGet(()->new UserProfileEntity(userId,null,null,null,null,AvatarType.PREDEFINED,"avatar_default",false,now));
  p.update(name,age,level,goal,name!=null&& !name.isBlank()&&age!=null&&level!=null&&goal!=null,now); return repo.save(p);
 }
 @Transactional public UserProfileEntity setAvatar(UUID userId,AvatarType type,String key){var now=OffsetDateTime.now(ZoneOffset.UTC);var p=repo.findById(userId).orElseGet(()->new UserProfileEntity(userId,null,null,null,null,AvatarType.PREDEFINED,"avatar_default",false,now));p.setAvatar(AvatarType.PREDEFINED,key,now);return repo.save(p);}
}
