import { HttpStatus } from '@nestjs/common';

export interface DbServiceApiResponse<T> {
  code: HttpStatus | number;
  message: string;
  data?: T;
  error?: string | string[];
}