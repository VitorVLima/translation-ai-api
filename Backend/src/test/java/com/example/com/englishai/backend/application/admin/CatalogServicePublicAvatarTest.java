package com.example.com.englishai.backend.application.admin;

import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CatalogServicePublicAvatarTest {
 @Test void publicCatalogContainsOnlyEnabledUserAvatarKeys(){
  var repo=mock(com.example.com.englishai.backend.infrastructure.persistence.repository.PredefinedAvatarJpaRepository.class);
  var scenarios=mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ScenarioDefinitionJpaRepository.class);
  var now=OffsetDateTime.now();
  when(repo.findByEnabledTrueOrderBySortOrderAsc()).thenReturn(List.of(
   new com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity(UUID.randomUUID(),"avatar_01","One","one",true,1,now),
   new com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity(UUID.randomUUID(),"avatar_default","Default","default",true,0,now),
   new com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity(UUID.randomUUID(),"interviewer_default","Interviewer","interviewer",true,2,now)));
  var result=new CatalogService(repo,scenarios,org.mockito.Mockito.mock(com.example.com.englishai.backend.application.ports.TextToSpeechProvider.class)).publicAvatars();
  assertThat(result).extracting("avatarKey").containsExactly("avatar_01");
 }
}
