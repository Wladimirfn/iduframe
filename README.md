# iduframe

**HyperFrames + nuestro mod**, como un solo paquete.

No es un fork. Es un wrapper con la versión de HyperFrames **fijada** y un mod de tres archivos que se aplica sobre el Studio. Cuando upstream saca una versión nueva, se sube el pin, `status` dice si el shell cambió, y si cambió se revisa el diff antes de tocar nada.

## Por qué no un fork

El repo de HyperFrames (`heygen-com/hyperframes`) es un monorepo Apache-2.0 de ~24 MB con su propio build. Un fork obliga a mergear cada release y a mantener el pipeline de bundling ajeno.

Acá lo único nuestro son:

| Archivo | Qué hace |
| --- | --- |
| `src/idu-es.js` | Traducción del Studio + botón ES/EN |
| `src/cli.mjs` | install / revert / status / measure / preview |
| `compat/<version>.json` | Hash del shell: si upstream lo cambia, `install` falla cerrado |

## Uso

```bash
npx iduframe preview --project ./mi-video
npx iduframe status
npx iduframe install
npx iduframe measure
npx iduframe revert
```

## Actualizar HyperFrames

```bash
# 1. subir el pin en package.json
# 2. instalar
npm install
# 3. ver si el shell sigue siendo el que conocemos
node src/cli.mjs status
```

Si `status` dice **shell cambiado**, `install` se niega a parchear hasta que:

1. mires el diff de `dist/studio/index.html`,
2. confirmes que `</body>` y el prefijo `/assets/` siguen existiendo,
3. crees `compat/<nueva-version>.json` con el hash nuevo.

Eso es a propósito: un parche aplicado sobre algo que cambió es peor que no aplicar.

## Cobertura del español

Medida con `iduframe measure` sobre el Studio real:

- **92,6%** de strings únicos
- **93,0%** de apariciones

Lo que falta no es UI: dos mensajes largos de lint que emite el CLI (requieren upstream), dos nombres de archivo y un atajo de teclado.

## Licencia y atribución

`iduframe` se distribuye bajo **Apache-2.0**, la misma licencia de HyperFrames. Ver [NOTICE](NOTICE).

HyperFrames es un producto de HeyGen (`https://hyperframes.heygen.com`). Este proyecto no está afiliado ni respaldado por HeyGen: agrega una capa de traducción y un instalador sobre su paquete, sin modificarlo más que lo declarado en el NOTICE.
