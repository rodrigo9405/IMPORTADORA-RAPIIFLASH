# Importadora Rapiiflash · Sistema de pedidos

Sistema web de pedidos con tres vistas: **administrador**, **courier** y **cliente**. Funciona en computadora y celular. Los datos, las cuentas y las fotos se guardan en **Supabase** (proyecto `IMPORTADORA-RAPIIFLASH`) y la página se publica con **GitHub Pages**.

## Enlaces

| Vista | Enlace |
|---|---|
| Cliente | https://rodrigo9405.github.io/IMPORTADORA-RAPIIFLASH/#cliente |
| Courier | https://rodrigo9405.github.io/IMPORTADORA-RAPIIFLASH/#courier |
| Administrador | https://rodrigo9405.github.io/IMPORTADORA-RAPIIFLASH/#admin |

Los tres enlaces abren la misma página; solo cambia la pestaña de ingreso que aparece elegida.

## Qué hace cada vista

### Administrador (correo y contraseña)
- **Inventario**: agregar, editar y eliminar productos con nombre, descripción y cantidad.
- **Clientes**: crear, editar y eliminar clientes con DNI, nombres, apellidos y contraseña. Al crearlo, el sistema muestra un mensaje listo para copiar y enviarle al cliente (enlace, DNI y contraseña).
- **Pedidos**: crear, editar y eliminar pedidos. Cada pedido tiene un cliente, una dirección de entrega, el tipo de envío (**motorizado** o **Shalom**) y productos del inventario.
  - Al crear el pedido, la cantidad se **descuenta del inventario**. No deja pedir más de lo que hay.
  - Al editarlo o eliminarlo antes de despacharlo, las unidades **vuelven al inventario**.
  - Todo pedido nuevo queda como **Creado**.
- En cada pedido ve **todo el proceso**: quién lo creó, empaquetó y cerró, con fecha y hora; **todas las fotos** (productos, paquete, motorizado o boleta) y la clave de Shalom.

### Courier (correo y contraseña)
- Ve los pedidos **por empaquetar** (creados) y **por despachar** (empaquetados).
- En un pedido creado presiona **Empaquetar**: ve los productos y cantidades, la dirección, el nombre y el DNI del cliente.
  - Sube una o más fotos en **Evidencia de productos** y en **Evidencia de pedido empaquetado** (con la cámara o desde la galería).
  - Presiona **Pedido empaquetado**: el pedido pasa a **Empaquetado**.
- Al volver a entrar al pedido:
  - **Motorizado**: sube una o más fotos del motorizado con el pedido y presiona **Cerrar pedido**.
  - **Shalom**: sube la foto de la boleta, escribe la **clave de Shalom** y presiona **Cerrar pedido**.
- Los pedidos cerrados desaparecen de su lista.

### Cliente (DNI y contraseña)
- Ve sus **pedidos actuales** y su **historial**.
- En cada pedido ve los productos que pidió y el avance.
- Si fue por motorizado, ve la **foto del motorizado** con su pedido.
- Si fue por Shalom, ve la **foto de la boleta** y la **clave de recojo**.
- No ve las fotos internas del empaquetado.

## Seguridad
- Las reglas de la base de datos (RLS) deciden qué ve cada cuenta. La clave pública en `js/config.js` **sí puede estar en el código**.
- Las fotos están en un depósito **privado** (`evidencias`). Se muestran con enlaces temporales de 1 hora.
- Las cuentas de clientes las crea la función `usuarios` (Supabase Edge Function), que solo responde a un administrador conectado.
- **Recomendado**: en Supabase ve a **Authentication → Sign In / Providers → Email** y desactiva **Allow new users to sign up**. Aunque alguien se registrara, no vería nada, pero así nadie puede crearse una cuenta.
- Nunca pongas la clave `service_role` o `secret` en este repositorio.

## Agregar otro courier o administrador
Esas cuentas no se crean desde la web. Sigue los pasos de [`supabase/02_personal.sql`](supabase/02_personal.sql).

## Archivos

```
index.html                         Página principal
css/estilos.css                    Estilos (modo claro y oscuro)
js/config.js                       Dirección y clave pública de Supabase
js/app.js                          Lógica de las tres vistas
img/icono.svg                      Ícono
supabase/01_esquema.sql            Tablas, reglas de acceso, stock, estados y fotos
supabase/02_personal.sql           Agregar couriers o administradores
supabase/functions/usuarios/       Función que crea, edita y elimina cuentas de clientes
```

## Cómo se guarda cada cosa
- **Estados del pedido**: `creado` → `empaquetado` → `cerrado`. Solo avanzan con los botones del courier y solo si tienen las fotos requeridas.
- **Fotos**: se reducen en el celular antes de subir (máx. 1600 px) para que suban rápido y ocupen poco.
- **Clientes eliminados**: sus pedidos se quedan en el sistema con su nombre y DNI.
- **Productos eliminados**: los pedidos que ya los tenían los siguen mostrando.

## Límites del plan gratis de Supabase
- 500 MB de base de datos y 1 GB de fotos (con fotos reducidas, alcanza para miles).
- Si el proyecto pasa una semana sin uso, Supabase lo pausa. Se reactiva desde el panel.

## Probarlo en tu computadora
En la carpeta del proyecto ejecuta `python3 -m http.server 8080` y entra a `http://localhost:8080`.
