FROM maven:3.9.11-eclipse-temurin-21 AS build

WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -ntp dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 englishai \
    && useradd --system --uid 10001 --gid englishai --create-home englishai \
    && mkdir -p /var/lib/englishai/avatars \
    && chown -R englishai:englishai /var/lib/englishai

WORKDIR /app
COPY --from=build /workspace/target/*.jar /app/app.jar

USER englishai:englishai

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
