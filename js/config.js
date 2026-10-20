// Conexión con Supabase (proyecto IMPORTADORA-RAPIIFLASH).
// La clave pública SÍ puede ir aquí: la seguridad la ponen las reglas de la base de datos.
// Nunca pongas aquí la clave "service_role" ni la "secret key".
window.RAPIIFLASH_CONFIG = {
  plataforma: 'Rapiiflash',
  supabaseUrl: 'https://tdnvdstoxwrotlnxzhga.supabase.co',
  supabaseKey: 'sb_publishable_W9fc7-0qfeUyrFZuLs276Q_QoCrm1Ee',
  // Huella (SHA-256) del correo del super administrador: al escribirlo en el
  // ingreso aparece el campo del código. El código se valida en el servidor.
  superHash: '3615fc92790acfcc6fab371b666d641bb0a40e70f084ca24bfa6a1c090a03367',
};
