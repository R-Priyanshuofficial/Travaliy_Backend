import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── Global Validation Pipe ──────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────
  app.enableCors();

  // ─── Swagger Setup ───────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Travaily API')
    .setDescription(
      'Production API for Travaily — AI-powered travel itinerary platform',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ─── Start Server ────────────────────────────────────────────────
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Travaily Backend running on port ${port}`);
  console.log(`📚 Swagger docs available at /api/docs`);
}
bootstrap();