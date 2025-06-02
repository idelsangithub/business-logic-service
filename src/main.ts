// business-logic-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000; // Puerto donde escucha el BL Service

  // Habilitar CORS para que el frontend pueda comunicarse
  app.enableCors({
    origin: 'http://localhost:3001', // <--- IMPORTANTE: PON AQUÍ EL PUERTO DONDE CORRE TU REACT APP (ej. 3000, 3001, 3002)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(port);
  console.log(`Business Logic Service is running on: ${await app.getUrl()}`);
}
bootstrap();