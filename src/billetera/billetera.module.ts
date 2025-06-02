import { Module } from '@nestjs/common';
import { BilleteraService } from './billetera.service';
import { BilleteraController } from './billetera.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [BilleteraService],
  controllers: [BilleteraController]
})
export class BilleteraModule {}
