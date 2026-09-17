export interface ConfiguracionTienda {
  nombreNegocio: string;
  iniciales: string;
  logoTicketUrl: string | null;
  mensajeTicketPie: string | null;
  mostrarCodigoBarrasTicket: boolean;
  mostrarVendedorTicket: boolean;
  mostrarSucursalTicket: boolean;
}

export interface GuardarIdentidadPayload {
  nombreNegocio: string;
  iniciales: string;
}

export interface GuardarConfiguracionTicketPayload {
  mensajeTicketPie: string | null;
  mostrarCodigoBarrasTicket: boolean;
  mostrarVendedorTicket: boolean;
  mostrarSucursalTicket: boolean;
}

export interface VistaPreviaTicketPayload extends GuardarConfiguracionTicketPayload {
  nombreNegocio?: string;
  iniciales?: string;
}

export interface SubirLogoResponse {
  logoTicketUrl: string | null;
}