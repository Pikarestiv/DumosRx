import { NestFactory } from "@nestjs/core"
import { ValidationPipe } from "@nestjs/common"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  // Enable CORS for frontend communication
  app.enableCors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })

  // API prefix
  app.setGlobalPrefix("api/v1")

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("DumosRx Store Management API")
    .setDescription("Complete store management system API for Nigerian businesses")
    .setVersion("1.0")
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup("api/docs", app, document)

  const port = process.env.PORT || 3001
  await app.listen(port)

  console.log(`🚀 DumosRx Server running on: http://localhost:${port}`)
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`)
}

bootstrap()
