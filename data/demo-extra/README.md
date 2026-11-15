# Lotes del pipeline fuera de la demo

Para la presentación, la demo pública muestra un solo lote de ejemplo, el "Lote de prueba" (el Lote 3 de `data/demo/`). Estos tres lotes se sacaron de `data/demo/` para que `import_events` no los vuelva a cargar al arrancar; la migración `lots/0005_lote_de_prueba` los deja como no públicos en la base, sin borrarlos. Para volver a mostrarlos: moverlos a `data/demo/` y revertir esa migración.
