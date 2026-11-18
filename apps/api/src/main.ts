import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AuthConfig } from './auth/auth.config';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ResponseMetaInterceptor } from './common/response-meta.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const authConfig = app.get(AuthConfig);
  app.use(helmet());
  app.use(json({ limit: '1mb', strict: true }));
  app.use(cookieParser());
  app.enableCors({
    origin: [...authConfig.allowedOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'X-XSRF-TOKEN',
      'X-Request-ID',
      'Idempotency-Key',
      'If-Match',
    ],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseMetaInterceptor());

  const openApiConfig = new DocumentBuilder()
    .setTitle('Automotive Search API')
    .setDescription(
      'Organization- and role-aware automotive catalog API backed by ParadeDB.',
    )
    .setVersion('1.0')
    .addCookieAuth('ACCESS_TOKEN')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, openApiDocument, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
  });
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
