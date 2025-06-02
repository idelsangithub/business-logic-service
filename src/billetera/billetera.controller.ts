// src/billetera/billetera.controller.ts
import { Controller, Post, Body, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { BilleteraService } from './billetera.service';
import { DbServiceApiResponse } from '../shared/interfaces/db-service-api-response.interface'; // Reutilizamos las interfaces de respuesta del DB Service
import { Client } from '../shared/interfaces/client.interface';
import { RegistroClienteDto } from '../shared/dto/registro-cliente.dto';
import { RecargaBilleteraDto } from '../shared/dto/recarga-billetera.dto';
import { IniciarPagoDto } from '../shared/dto/iniciar-pago.dto';
import { ConfirmarPagoDto } from '../shared/dto/confirmar-pago.dto';
import { ConsultarSaldoDto } from '../shared/dto/consultar-saldo.dto';


@Controller('billetera')
export class BilleteraController {
  constructor(private readonly billeteraService: BilleteraService) {}

  @Post('registro-cliente')
  @HttpCode(HttpStatus.OK)
  async registroCliente(@Body() dto: RegistroClienteDto): Promise<DbServiceApiResponse<Client>> {
    return this.billeteraService.registroCliente(dto);
  }

  @Post('recarga')
  @HttpCode(HttpStatus.OK)
  async recargaBilletera(@Body() dto: RecargaBilleteraDto): Promise<DbServiceApiResponse<Client>> {

    return this.billeteraService.recargaBilletera(dto);
  }

  @Post('iniciar-pago')
  @HttpCode(HttpStatus.OK)
  async iniciarPago(@Body() dto: IniciarPagoDto): Promise<DbServiceApiResponse<{ idSesion: string; mensajeConfirmacion: string }>> {
    return this.billeteraService.iniciarPago(dto);
  }

  @Post('confirmar-pago')
  @HttpCode(HttpStatus.OK)
  async confirmarPago(@Body() dto: ConfirmarPagoDto): Promise<DbServiceApiResponse<Client>> {
    return this.billeteraService.confirmarPago(dto);
  }

  @Get('saldo')
  @HttpCode(HttpStatus.OK)
  async consultarSaldo(@Query() dto: ConsultarSaldoDto): Promise<DbServiceApiResponse<{ saldo: number }>> {
    return this.billeteraService.consultarSaldo(dto);
  }
}