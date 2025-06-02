import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios'; // Importa HttpModule
import { ConfigModule, ConfigService } from '@nestjs/config'; // Importa ConfigModule y ConfigService
import { MailerModule } from '@nestjs-modules/mailer';
import { BilleteraModule } from './billetera/billetera.module';

@Module({
  imports: [
    // Configuración de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: 5000,
        maxRedirects: 5,
        baseURL: configService.get<string>('DB_SERVICE_URL'),// Usa la URL del DB Service desde .env
      }),
      inject: [ConfigService],
    }),
    // Configuración para el envío de correos
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('EMAIL_HOST'),
          port: configService.get<string>('EMAIL_PORT'),
          secure: false, // Usar 'false' para Mailtrap, 'true' con 465 para otros SMTPs
          auth: {
            user: configService.get<string>('EMAIL_USER'),
            pass: configService.get<string>('EMAIL_PASS'),
          },
          ignoreTLS: true, // Ignorar TLS si es necesario (ej: Mailtrap)
        },
        defaults: {
          from: `"Billetera Virtual"<${configService.get<string>('EMAIL_FROM')}>`,
        }
      }),
      inject: [ConfigService],
    }),
    BilleteraModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
