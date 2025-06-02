export interface Client {
  id: number;
  documento: string;
  nombres: string;
  email: string;
  celular: string;
  saldo: number;
  fechaRegistro: Date;
  fechaActualizacion: Date;
}
