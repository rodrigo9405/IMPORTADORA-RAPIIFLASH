// Conexión con Supabase (proyecto IMPORTADORA-RAPIIFLASH).
// La clave pública SÍ puede ir aquí: la seguridad la ponen las reglas de la base de datos.
// Nunca pongas aquí la clave "service_role" ni la "secret key".
window.RAPIIFLASH_CONFIG = {
  empresa: 'Importadora Rapiiflash',
  supabaseUrl: 'https://tdnvdstoxwrotlnxzhga.supabase.co',
  supabaseKey: 'sb_publishable_W9fc7-0qfeUyrFZuLs276Q_QoCrm1Ee',
  // Los clientes entran con su DNI; por dentro se usa este correo interno.
  // Debe coincidir con DOMINIO_CLIENTES en supabase/functions/usuarios/index.ts
  dominioClientes: 'clientes.rapiiflash.invalid',
};
