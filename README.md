# Rapiiflash · Sistema de pedidos para importadoras

Un solo sistema para **varios negocios**. Cada negocio tiene su administrador, sus couriers y sus clientes, con su propio logotipo y sus colores. Por encima de todos está el **super administrador**. Los datos, las cuentas y las fotos se guardan en **Supabase** (proyecto `IMPORTADORA-RAPIIFLASH`) y la página se publica con **GitHub Pages**.

## Enlaces

- **Ingreso general:** https://rodrigo9405.github.io/IMPORTADORA-RAPIIFLASH/
- **Ingreso con la marca de un negocio:** agrega `?n=` y el código del negocio, por ejemplo `https://rodrigo9405.github.io/IMPORTADORA-RAPIIFLASH/?n=rapiiflash`. El super administrador ve y copia este enlace en el resumen de cada negocio.

## Ingreso

Hay una sola pantalla de ingreso: **«Ingresa a tu cuenta»**. El sistema reconoce la cuenta y abre la vista que le corresponde.

- **Correo + contraseña** → super administrador, administrador o courier.
- **DNI + contraseña** → cliente. Si el mismo DNI es cliente de dos negocios, el sistema pregunta a cuál entrar. Desde el enlace con marca entra directo a ese negocio.
- **Super administrador**: al escribir su correo aparece el campo **código de seguridad** de 4 dígitos. El código se comprueba en el servidor y vale 12 horas por sesión. Tras 5 códigos equivocados, se bloquea 15 minutos.

## Qué hace cada vista

### Super administrador
- **Negocios**: todos los negocios (activos, pausados, terminados) con su número de administradores, couriers, clientes, pedidos y productos.
- **Cada negocio** tiene pestañas:
  - **Resumen**: cifras, servicio y datos del negocio.
  - **Pedidos, Inventario, Clientes**: lo mismo que ve su administrador, con permiso para crear, editar y eliminar.
  - **Accesos**: correos y DNI de cada cuenta con su contraseña (botón del ojo). Desde aquí crea, edita y elimina administradores y couriers.
- **Crear negocio**: elige si llena los datos él mismo o si los llena el administrador del negocio.
  - Si los llena él: nombre, teléfono, RUC (opcional), Instagram (opcional), dirección, dueño, DNI, logotipo y paleta de colores.
  - Si los llena el administrador: crea su cuenta. Al ingresar, el administrador completa esos datos una sola vez. Después solo el super puede verlos y editarlos.
- **Servicio de cada negocio** (solo lo ve el super): fecha de creación, fecha de inicio, y los botones pausar, reanudar, terminar y comenzar de nuevo, con su historial. **Pausar o terminar bloquea todas las cuentas del negocio** (administradores, couriers y clientes). Al reanudar se desbloquean.
- **Eliminar negocio**: borra todo lo del negocio. Para confirmar hay que escribir su nombre.

### Administrador (de un negocio)
- **Inventario**: productos con nombre, descripción y cantidad.
- **Clientes**: DNI, nombres, apellidos y contraseña. Al crear un cliente sale un mensaje listo para copiar con el enlace de su negocio.
- **Pedidos**:
  - Cada pedido lleva cliente, dirección, envío (motorizado o Shalom), **vendedor (courier)** y productos con **precio opcional**.
  - El stock se descuenta al crear el pedido y vuelve al inventario si lo editas o eliminas antes de despacharlo.
  - Cada negocio tiene su propia numeración.
- **Boleta**: se genera sola con cada pedido. Lleva el logotipo, el nombre, el RUC, la dirección, el teléfono y el Instagram del negocio, además del cliente, el vendedor y el detalle con importes. Se imprime o se guarda en PDF.

### Courier
- Ve los pedidos por empaquetar y por despachar de su negocio.
- Sube las fotos de productos y del paquete, y marca el pedido como empaquetado.
- Luego sube la foto con el motorizado, o la boleta de Shalom con su clave, y cierra el pedido.

### Cliente
- Ve sus pedidos actuales y su historial, con su boleta, la foto del motorizado o la boleta de Shalom y la clave de recojo.

> La boleta es un documento interno del pedido. **No es un comprobante electrónico SUNAT.** Para emitir comprobantes válidos ante SUNAT haría falta conectar un proveedor (OSE/PSE).

## Seguridad
- Las reglas de la base de datos (RLS) separan los negocios: ninguna cuenta ve datos de otro negocio.
- Las contraseñas que ve el super se guardan **cifradas**. La llave de cifrado está en Supabase Vault. Las cuentas creadas antes de esta versión aparecen como «Sin registrar» hasta que se les pone una contraseña nueva.
- Las fotos de evidencia están en un depósito privado. Los logotipos están en un depósito público, porque salen en las boletas.
- La clave pública de `js/config.js` sí puede estar en el código. Nunca subas la clave `service_role` ni la `secret`.
- **Recomendado**: en Supabase, ve a **Authentication → Sign In / Providers → Email** y desactiva **Allow new users to sign up**.

## Instalación desde cero (otro proyecto de Supabase)
1. En **SQL Editor**, ejecuta en orden `supabase/01_esquema.sql` y `supabase/03_multinegocio.sql`.
2. Publica la función `supabase/functions/usuarios` con la verificación JWT **desactivada**: la función comprueba por sí misma quién la llama.
3. Crea al super administrador:
   - Llama una vez a la función con `{"accion":"alta_super","email":"…","password":"…"}`. Solo funciona si todavía no existe ninguno.
   - Luego ejecuta en SQL:
     `insert into superadmins (user_id, email, codigo_hash) select id, email, extensions.crypt('CÓDIGO', extensions.gen_salt('bf')) from auth.users where email = '…';`
4. En `js/config.js` pon la URL y la clave pública del proyecto, y en `superHash` la huella SHA-256 del correo del super, en minúsculas.

## Archivos

```
index.html                       Página principal
css/estilos.css                  Estilos (colores de cada negocio, modo claro y oscuro, impresión de boleta)
js/config.js                     Conexión con Supabase
js/app.js                        Lógica de las cuatro vistas
supabase/01_esquema.sql          Tablas base, stock, estados y fotos
supabase/03_multinegocio.sql     Negocios, super administrador, accesos cifrados y boletas
supabase/functions/usuarios/     Cuentas de clientes, administradores y couriers; servicio del negocio
```

## Límites del plan gratis de Supabase
- 500 MB de base de datos y 1 GB de archivos. Las fotos se reducen antes de subir.
- Si el proyecto pasa una semana sin uso, Supabase lo pausa. Se reactiva desde el panel.
