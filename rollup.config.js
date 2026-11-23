import deckyPlugin from "@decky/rollup";

// El nombre del plugin (plugin.json) se incrusta en el bundle: @decky/api lo usa para conectar con el backend.
// La copia de desarrollo (package.sh --dev) lo compila con QAM_MANIFEST_DIR apuntando a un plugin.json con otro nombre.
export default deckyPlugin({}, process.env.QAM_MANIFEST_DIR || ".");
