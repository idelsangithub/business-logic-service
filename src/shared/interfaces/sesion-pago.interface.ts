export interface SesionPago {
  id: number;
  clienteId: number;
  valorCompra: number;
  token: string;
  idSesion: string;
  expiracionToken: Date;
  estado: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}