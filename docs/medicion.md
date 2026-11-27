# Medición de accesibilidad visual

Fecha: 26/11/2026, 10:20:45 · Servidor: http://localhost:5176 (modo demo)

Contraste calculado contra el fondo visible (capas semitransparentes, degradados y opacidad incluidos). 
"Principal" = texto con el color de texto principal del tema, exigido a 7:1; todo el resto a 4,5:1. 
"Bordes/íconos" = contorno de cada control con borde o fondo propio, y cada ícono SVG, a 3:1 contra el fondo de alrededor. 
"Foco no visible" = elementos alcanzados con Tab cuyo contorno de foco mide menos de 3 px, contrasta menos de 3:1 o queda recortado. 
"Texto <16px": mínimo de 16 px para todo el texto, salvo las etiquetas de la barra de navegación inferior, que se aceptan desde 12 px.

## Verificación de temas

| Verificación | Resultado | Detalle |
|---|---|---|
| Fondo del body distinto en claro y oscuro (360 px) | OK | claro rgb(238, 242, 247) · oscuro rgb(2, 6, 23) |
| Fondo del body distinto en claro y oscuro (1280 px) | OK | claro rgb(238, 242, 247) · oscuro rgb(2, 6, 23) |
| Automático con sistema en claro | OK | data-theme="light" |
| Automático con sistema en oscuro | OK | data-theme="dark" |

## Resultados por vista

| Vista | Ancho | Tema | Texto <16px | Contraste <4,5:1 | Principal <7:1 | Bordes/íconos <3:1 | Foco no visible | Controles <48px | Sin etiqueta | Desborde | Captura |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hoy | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_360_light.png) |
| hoy_detalle | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_detalle_360_light.png) |
| perros | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/perros_360_light.png) |
| perros_abierta | 360 | claro | 0 | 0 | 0 | 0 | 0 | 2 | 0 | no | [ver](capturas/perros_abierta_360_light.png) |
| cobros | 360 | claro | 11 | 0 | 0 | 0 | 0 | 9 | 0 | no | [ver](capturas/cobros_360_light.png) |
| ajustes | 360 | claro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_360_light.png) |
| ventana_nueva_estadia | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_nueva_estadia_360_light.png) |
| ventana_editar_ficha | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_editar_ficha_360_light.png) |
| ventana_finalizar | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_finalizar_360_light.png) |
| ventana_historial | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_historial_360_light.png) |
| ventana_borrar | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_borrar_360_light.png) |
| aviso_deshacer | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_deshacer_360_light.png) |
| huella_activar | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_360_light.png) |
| ajustes_huella_no_disponible | 360 | claro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_huella_no_disponible_360_light.png) |
| huella_activar_error | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_error_360_light.png) |
| huella_desbloquear | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_360_light.png) |
| huella_desbloquear_contrasena | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_contrasena_360_light.png) |
| ajustes_respaldo_error | 360 | claro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_respaldo_error_360_light.png) |
| aviso_lectura | 360 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_lectura_360_light.png) |
| hoy | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_360_dark.png) |
| hoy_detalle | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_detalle_360_dark.png) |
| perros | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/perros_360_dark.png) |
| perros_abierta | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 2 | 0 | no | [ver](capturas/perros_abierta_360_dark.png) |
| cobros | 360 | oscuro | 11 | 0 | 0 | 0 | 0 | 9 | 0 | no | [ver](capturas/cobros_360_dark.png) |
| ajustes | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_360_dark.png) |
| ventana_nueva_estadia | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_nueva_estadia_360_dark.png) |
| ventana_editar_ficha | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_editar_ficha_360_dark.png) |
| ventana_finalizar | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_finalizar_360_dark.png) |
| ventana_historial | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_historial_360_dark.png) |
| ventana_borrar | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_borrar_360_dark.png) |
| aviso_deshacer | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_deshacer_360_dark.png) |
| huella_activar | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_360_dark.png) |
| ajustes_huella_no_disponible | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_huella_no_disponible_360_dark.png) |
| huella_activar_error | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_error_360_dark.png) |
| huella_desbloquear | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_360_dark.png) |
| huella_desbloquear_contrasena | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_contrasena_360_dark.png) |
| ajustes_respaldo_error | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_respaldo_error_360_dark.png) |
| aviso_lectura | 360 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_lectura_360_dark.png) |
| hoy | 1280 | claro | 7 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_1280_light.png) |
| hoy_detalle | 1280 | claro | 7 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_detalle_1280_light.png) |
| perros | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/perros_1280_light.png) |
| perros_abierta | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 2 | 0 | no | [ver](capturas/perros_abierta_1280_light.png) |
| cobros | 1280 | claro | 11 | 0 | 0 | 0 | 0 | 9 | 0 | no | [ver](capturas/cobros_1280_light.png) |
| ajustes | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_1280_light.png) |
| ventana_nueva_estadia | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_nueva_estadia_1280_light.png) |
| ventana_editar_ficha | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_editar_ficha_1280_light.png) |
| ventana_finalizar | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_finalizar_1280_light.png) |
| ventana_historial | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_historial_1280_light.png) |
| ventana_borrar | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_borrar_1280_light.png) |
| aviso_deshacer | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_deshacer_1280_light.png) |
| huella_activar | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_1280_light.png) |
| ajustes_huella_no_disponible | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_huella_no_disponible_1280_light.png) |
| huella_activar_error | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_error_1280_light.png) |
| huella_desbloquear | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_1280_light.png) |
| huella_desbloquear_contrasena | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_contrasena_1280_light.png) |
| ajustes_respaldo_error | 1280 | claro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_respaldo_error_1280_light.png) |
| aviso_lectura | 1280 | claro | 7 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_lectura_1280_light.png) |
| hoy | 1280 | oscuro | 7 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_1280_dark.png) |
| hoy_detalle | 1280 | oscuro | 7 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/hoy_detalle_1280_dark.png) |
| perros | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/perros_1280_dark.png) |
| perros_abierta | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 2 | 0 | no | [ver](capturas/perros_abierta_1280_dark.png) |
| cobros | 1280 | oscuro | 11 | 0 | 0 | 0 | 0 | 9 | 0 | no | [ver](capturas/cobros_1280_dark.png) |
| ajustes | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_1280_dark.png) |
| ventana_nueva_estadia | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_nueva_estadia_1280_dark.png) |
| ventana_editar_ficha | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_editar_ficha_1280_dark.png) |
| ventana_finalizar | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_finalizar_1280_dark.png) |
| ventana_historial | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_historial_1280_dark.png) |
| ventana_borrar | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/ventana_borrar_1280_dark.png) |
| aviso_deshacer | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_deshacer_1280_dark.png) |
| huella_activar | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_1280_dark.png) |
| ajustes_huella_no_disponible | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_huella_no_disponible_1280_dark.png) |
| huella_activar_error | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_activar_error_1280_dark.png) |
| huella_desbloquear | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_1280_dark.png) |
| huella_desbloquear_contrasena | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/huella_desbloquear_contrasena_1280_dark.png) |
| ajustes_respaldo_error | 1280 | oscuro | 0 | 0 | 0 | 0 | 0 | 1 | 0 | no | [ver](capturas/ajustes_respaldo_error_1280_dark.png) |
| aviso_lectura | 1280 | oscuro | 7 | 0 | 0 | 0 | 0 | 0 | 0 | no | [ver](capturas/aviso_lectura_1280_dark.png) |

## Totales

- Textos < 16px: **86**
- Contraste < 4,5:1: **0**
- Texto principal < 7:1: **0**
- Bordes de controles e íconos < 3:1: **0**
- Foco con teclado no visible: **0** (de 1260 elementos recorridos con Tab)
- Controles < 48px: **56**
- Campos sin etiqueta: **0**
- Vistas con desborde horizontal: **0**
- Vistas que no se pudieron abrir: **0**
- Verificaciones de tema fallidas: **0**

## Textos < 16px

| Tamaño | Texto | Dónde |
|---|---|---|
| 12px | 1 finalizada | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Con “Cobrado” y “Tasa” tildadas pasa sola al Historial. | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | 3 sin transferir | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Desde el | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Total | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 13px | El tilde de “transferida” de las estadías archivadas se guar | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Año | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Est. | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Días | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Facturado | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Tasa | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| 12px | Finalizar la pasa a Cobros. Borrar la quita sin dejar regist | hoy/1280/claro, hoy_detalle/1280/claro, aviso_lectura/1280/claro, hoy/1280/oscuro (+2) |

## Controles < 48px

| Tag | Texto | Tamaño | Dónde |
|---|---|---|---|
| button | Borrar la estadía de Rocky del 2026-10-05 al 2026- | 94×44 | perros_abierta/360/claro, perros_abierta/360/oscuro, perros_abierta/1280/claro, perros_abierta/1280/oscuro |
| button | Borrar la estadía de Rocky del 2026-02-10 al 2026- | 94×44 | perros_abierta/360/claro, perros_abierta/360/oscuro, perros_abierta/1280/claro, perros_abierta/1280/oscuro |
| button | Exportar CSV | 73×44 | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| button | Descargar para Excel | 82×44 | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| button | Registro de estadías (9) | 225×44 | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| button | Kiara | 128×44 | cobros/360/claro, cobros/360/oscuro |
| button | Marcar todas (3) | 151×44 | cobros/360/claro, cobros/360/oscuro, cobros/1280/claro, cobros/1280/oscuro |
| button | Rocky · 5/10 | 227×44 | cobros/360/claro, cobros/360/oscuro |
| button | Rocky · 10/2 | 227×44 | cobros/360/claro, cobros/360/oscuro |
| button | Nina | 227×44 | cobros/360/claro, cobros/360/oscuro |
| button | Últimas transferidas (1) | 310×44 | cobros/360/claro, cobros/360/oscuro |
| button | Revisar | 82×44 | ajustes/360/claro, ajustes_huella_no_disponible/360/claro, ajustes_respaldo_error/360/claro, ajustes/360/oscuro (+8) |
| button | Kiara | 800×44 | cobros/1280/claro, cobros/1280/oscuro |
| button | Rocky · 5/10 | 899×44 | cobros/1280/claro, cobros/1280/oscuro |
| button | Rocky · 10/2 | 899×44 | cobros/1280/claro, cobros/1280/oscuro |
| button | Nina | 899×44 | cobros/1280/claro, cobros/1280/oscuro |
| button | Últimas transferidas (1) | 982×44 | cobros/1280/claro, cobros/1280/oscuro |
