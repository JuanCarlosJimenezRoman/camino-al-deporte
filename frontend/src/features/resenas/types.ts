export interface ResenaFoto {
  id: number;
  url: string;
}

export interface ResenaPedidoItem {
  variante: {
    producto: {
      nombre: string;
    };
  };
}

export interface ResenaPedido {
  id: number;
  folio: string;
  cliente: { nombre: string } | null;
  items: ResenaPedidoItem[];
}

export interface Resena {
  id: number;
  calificacionProducto: number;
  calificacionEnvio: number;
  comentario: string | null;
  createdAt: string;
  visible: boolean;
  fotos: ResenaFoto[];
  pedido: ResenaPedido;
}