export interface Transaccion {
  id: number;
  clienteId: number;
  tipo: string;
  valor: number;
  fechaTransaccion: Date;
  estado: string;
}