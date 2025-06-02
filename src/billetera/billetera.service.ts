// src/billetera/billetera.service.ts
import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException, ConflictException, HttpStatus, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid'; // Para generar UUIDs
import { MailerService } from '@nestjs-modules/mailer'; // Para enviar correos
// Importar interfaces del DB Service
import { DbServiceApiResponse } from '../shared/interfaces/db-service-api-response.interface';
import { Client } from '../shared/interfaces/client.interface';
import { SesionPago } from '../shared/interfaces/sesion-pago.interface';
import { ConsultarSaldoDto } from 'src/shared/dto/consultar-saldo.dto';
import { ConfirmarPagoDto } from 'src/shared/dto/confirmar-pago.dto';
import { RegistroClienteDto } from 'src/shared/dto/registro-cliente.dto';
import { IniciarPagoDto } from 'src/shared/dto/iniciar-pago.dto';
import { RecargaBilleteraDto } from 'src/shared/dto/recarga-billetera.dto';
@Injectable()
export class BilleteraService {
  private dbServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {
    this.dbServiceUrl = this.configService.get<string>('DB_SERVICE_URL') || 'http://localhost:3002';

    if (!this.dbServiceUrl) {
      throw new InternalServerErrorException('DB_SERVICE_URL environment variable is not set.');
    }
  }

  // --- Funcionalidad 1: Registro Clientes ---
  async registroCliente(dto: RegistroClienteDto): Promise<DbServiceApiResponse<Client>> {

    try {
      if (!dto.documento || !dto.nombres || !dto.email || !dto.celular) {
        throw new BadRequestException('Todos los campos son requeridos para el registro.');
      }

      // Llama al DB Service para crear el cliente
      const response = await firstValueFrom(
        this.httpService.post<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente`, dto)
      );

      return response.data;
    } catch (error) {

      this.handleServiceError(error, 'Error al registrar cliente.');
    }
  }

  // --- Funcionalidad 2: Recarga Billetera ---
  async recargaBilletera(dto: RecargaBilleteraDto): Promise<DbServiceApiResponse<Client>> {
    try {
      if (!dto.documento || !dto.celular || !dto.valor || dto.valor <= 0) {
        throw new BadRequestException('Documento, celular y un valor positivo son requeridos para la recarga.');
      }

      // 1. Buscar cliente en DB Service
      const clienteResponse = await firstValueFrom(
        this.httpService.get<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente/${dto.documento}/${dto.celular}`)
      );
      

      if (clienteResponse.data.code !== 200 || !clienteResponse.data.data) {
        throw new NotFoundException('Cliente no encontrado para la recarga.');
      }
      const cliente = clienteResponse.data.data;

      // 2. Actualizar saldo del cliente en DB Service
      const updateSaldoDto = { valor: dto.valor, tipo: 'increment' };
      const updateResponse = await firstValueFrom(
        this.httpService.patch<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente/${cliente.id}/saldo`, updateSaldoDto)
      );

      if (updateResponse.data.code !== 200 || !updateResponse.data.data) {
        throw new InternalServerErrorException('Error interno al actualizar el saldo de la billetera.');
      }

      // 3. Registrar transacción (opcional, pero buena práctica)
      await firstValueFrom(
        this.httpService.post<DbServiceApiResponse<any>>(`${this.dbServiceUrl}/transacciones`, {
          clienteId: cliente.id,
          tipo: 'RECARGA',
          valor: dto.valor,
          estado: 'EXITO',
        })
      ).catch(txError => console.error('Error al registrar transacción de recarga:', txError.message)); // No bloquea la respuesta principal

      return { code: 200, message: 'Recarga de billetera exitosa.', data: updateResponse.data.data };
    } catch (error) {
      this.handleServiceError(error, 'Error al realizar la recarga.');
    }
  }

  // --- Funcionalidad 3: Pagar (Iniciar Compra) ---
  async iniciarPago(dto: IniciarPagoDto): Promise<DbServiceApiResponse<{ idSesion: string; mensajeConfirmacion: string }>> {
    try {
     
      if (!dto.documento || !dto.celular || !dto.valorCompra || dto.valorCompra <= 0) {
        throw new BadRequestException('Documento, celular y un valor de compra positivo son requeridos.');
      }

      // 1. Buscar cliente en DB Service
      const clienteResponse = await firstValueFrom(
        this.httpService.get<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente/${dto.documento}/${dto.celular}`)
      );

           

      if (clienteResponse.data.code !== 200 || !clienteResponse.data.data) {
        throw new NotFoundException('Cliente no encontrado.');
      }
      const cliente = clienteResponse.data.data;
      
      // 2. Verificar saldo
      if (cliente.saldo < dto.valorCompra) {
        throw new ConflictException('Saldo insuficiente para realizar la compra.');
      }

      // 3. Generar Token y ID de Sesión
      const token = this.generateRandomToken(6); // Función auxiliar para generar token
     
      const idSesion = uuidv4();
      const expiracionToken = new Date();
      expiracionToken.setMinutes(expiracionToken.getMinutes() + 5); // Token válido por 5 minutos

      // 4. Guardar sesión de pago en DB Service
      const createSesionDto = {
        clienteId: cliente.id,
        valorCompra: dto.valorCompra,
        token: token,
        idSesion: idSesion,
        expiracionToken: expiracionToken,
      };
      const sesionResponse = await firstValueFrom(
        this.httpService.post<DbServiceApiResponse<SesionPago>>(`${this.dbServiceUrl}/sesion-pago`, createSesionDto)
      );

      if (sesionResponse.data.code !== 200 || !sesionResponse.data.data) {
        throw new InternalServerErrorException('Error interno al crear la sesión de pago.');
      }      

      // 5. Enviar token al email del usuario
      await this.mailerService.sendMail({
        to: cliente.email,
        subject: 'Código de Confirmación de Pago para tu Billetera Virtual',
        html: `
          <p>Hola ${cliente.nombres},</p>
          <p>Tu código de confirmación para tu compra de $${dto.valorCompra.toFixed(2)} es: <strong>${token}</strong></p>
          <p>Este código es válido por 5 minutos. Si no solicitaste esta compra, por favor ignora este correo.</p>
          <p>Tu ID de sesión para la confirmación es: <strong>${idSesion}</strong></p>
          <p>Gracias por usar nuestra billetera virtual.</p>
        `,
      }).catch(mailError => {
        console.error('Error al enviar correo de confirmación:', mailError);
        // Opcional: Podrías revertir la creación de la sesión de pago o marcarla como fallida
        // pero para este ejercicio, continuamos, ya que el error de mail no debería bloquear la lógica principal
      });

      return {
        code: 200,
        message: 'Código de confirmación enviado al correo electrónico y sesión de pago creada.',
        data: { idSesion, mensajeConfirmacion: 'Se ha enviado un código de confirmación a tu correo electrónico. Por favor, úsalo junto con el ID de sesión para confirmar la compra.' },
      };
    } catch (error) {
     
      this.handleServiceError(error, 'Error al iniciar el pago.');
    }
  }

  // --- Funcionalidad 4: Confirmar Pago ---
  async confirmarPago(dto: ConfirmarPagoDto): Promise<DbServiceApiResponse<Client>> {
    try {
      if (!dto.idSesion || !dto.token) {
        throw new BadRequestException('ID de sesión y token son requeridos para la confirmación.');
      }
      
      // 1. Buscar sesión de pago en DB Service
      const sesionResponse = await firstValueFrom(
        this.httpService.get<DbServiceApiResponse<SesionPago>>(`${this.dbServiceUrl}/sesion-pago/${dto.idSesion}`)
      );
      

      if (sesionResponse.data.code !== 200 || !sesionResponse.data.data) {
        throw new NotFoundException('Sesión de pago no encontrada o inválida.');
      }
      const sesion = sesionResponse.data.data;

      // 2. Validar estado de la sesión
      if (sesion.estado !== 'PENDIENTE') {
        throw new ConflictException(`La sesión ya ha sido ${sesion.estado.toLowerCase()}.`);
      }

      // 3. Validar token y expiración
      const now = new Date();
      if (sesion.token !== dto.token || now > new Date(sesion.expiracionToken)) {
        await this.httpService.patch<DbServiceApiResponse<SesionPago>>(`${this.dbServiceUrl}/sesion-pago/${sesion.idSesion}/estado`, { estado: 'CANCELADO' }).toPromise(); // Marcar como cancelada
        throw new BadRequestException('Token inválido o expirado.');
      }

      // 4. Buscar cliente y actualizar saldo
      const clienteResponse = await firstValueFrom(
        this.httpService.get<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente/${sesion.clienteId}`)
      );
      
      if (clienteResponse.data.code !== 200 || !clienteResponse.data.data) {
        throw new NotFoundException('Cliente asociado a la sesión no encontrado.');
      }
      const cliente = clienteResponse.data.data;
     
      if (cliente.saldo < sesion.valorCompra) {
        await this.httpService.patch<DbServiceApiResponse<SesionPago>>(`${this.dbServiceUrl}/sesion-pago/${sesion.idSesion}/estado`, { estado: 'FALLO' }).toPromise();
        throw new ConflictException('Saldo insuficiente para completar la compra.');
      }

      const updateSaldoDto = { valor: sesion.valorCompra, tipo: 'decrement' };
      
      const updateResponse = await firstValueFrom(
        this.httpService.patch<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente/${cliente.id}/saldo`, updateSaldoDto)
      );

      if (updateResponse.data.code !== 200 || !updateResponse.data.data) {
        throw new InternalServerErrorException('Error interno al descontar el saldo.');
      }

      // 5. Actualizar estado de la sesión a CONFIRMADO
      await firstValueFrom(
        this.httpService.patch<DbServiceApiResponse<SesionPago>>(`${this.dbServiceUrl}/sesion-pago/${sesion.idSesion}/estado`, { estado: 'CONFIRMADO' })
      );

      // 6. Registrar transacción de pago
      await firstValueFrom(
        this.httpService.post<DbServiceApiResponse<any>>(`${this.dbServiceUrl}/transaccion`, {
          clienteId: cliente.id,
          tipo: 'PAGO',
          valor: sesion.valorCompra,
          estado: 'EXITO',
        })
      ).catch(txError => console.error('Error al registrar transacción de pago:', txError.message));

      return { code: 200, message: 'Pago confirmado exitosamente.', data: updateResponse.data.data };
    } catch (error) {
      this.handleServiceError(error, 'Error al confirmar el pago.');
    }
  }

  // --- Funcionalidad 5: Consultar Saldo ---
  async consultarSaldo(dto: ConsultarSaldoDto): Promise<DbServiceApiResponse<{ saldo: number }>> {
    try {
      if (!dto.documento || !dto.celular) {
        throw new BadRequestException('Documento y celular son requeridos para consultar el saldo.');
      }

      // Llama al DB Service para buscar el cliente y obtener su saldo
      const clienteResponse = await firstValueFrom(
        this.httpService.get<DbServiceApiResponse<Client>>(`${this.dbServiceUrl}/cliente/${dto.documento}/${dto.celular}`)
      );
       
      if (clienteResponse.data.code !== 200 || !clienteResponse.data.data) {
        throw new NotFoundException('Cliente no encontrado.');
      }

      return { code: 200, message: 'Saldo consultado exitosamente.', data: { saldo: clienteResponse.data.data.saldo } };
    } catch (error) {
     this.handleServiceError(error, 'Error al consultar el saldo del cliente.');
    }
  }

  // --- Métodos Auxiliares ---
  private generateRandomToken(length: number): string {
    let result = '';
    const characters = '0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

private handleServiceError(error: unknown, defaultMessage: string): never {
        // 1. Si el error YA ES una HttpException de NestJS, simplemente la relanzamos.
    // Esto captura tus lanzamientos directos de NotFoundException, ConflictException, etc.
    if (error instanceof HttpException) {
     
      throw error;
    }
    // 2. Si el error es un AxiosError (de una llamada HTTP externa, ej. a DbService)
    else if (error instanceof AxiosError) {
     
      if (error.response && error.response.data) {
        // Asume que la respuesta de error del DB Service sigue tu formato DbServiceApiResponse
        const dbError: DbServiceApiResponse<any> = error.response.data;
        console.log('--- BilleteraService: AxiosError con respuesta. Código DB:', dbError.code, 'Mensaje DB:', dbError.message);

        // Mapea los códigos internos del DB Service a HttpExceptions de NestJS
        switch (dbError.code) {
          case 400: throw new BadRequestException(dbError.message || defaultMessage);
          case 404: throw new NotFoundException(dbError.message || defaultMessage);
          case 409: throw new ConflictException(dbError.message || defaultMessage);
          case 500: throw new InternalServerErrorException(dbError.message || defaultMessage);
          default:
            console.warn('--- BilleteraService: Código de error desconocido del DB Service:', dbError.code);
            throw new InternalServerErrorException(dbError.message || defaultMessage);
        }
      } else if (error.request) {
        // La petición se hizo pero no hubo respuesta (DB Service caído o inalcanzable)
       
        throw new InternalServerErrorException('El servicio de base de datos no está disponible. Intente más tarde.');
      } else {
        // Otros errores de Axios (ej. problemas de configuración de la petición)
        
        throw new InternalServerErrorException(`Error de solicitud al DB Service: ${error.message || defaultMessage}`);
      }
    }
    // 3. Para cualquier otro tipo de error no manejado (ej. un Error genérico de JavaScript)
    else if (error instanceof Error) {
    
      throw new InternalServerErrorException(`Error inesperado: ${error.message || defaultMessage}`);
    }
    // 4. Si el error no es ni siquiera una instancia de Error (muy raro)
    else {
      
      throw new InternalServerErrorException(defaultMessage);
    }
  }






}