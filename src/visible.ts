// Secciones que siguen montadas aunque no se vean (cambio de seccion instantaneo). Las ocultas no deben trabajar:
// los sondeos periodicos consultan este contexto y se paran mientras su seccion no esta a la vista.
import { createContext, useContext } from "react";

export const VisibleContext = createContext(true);
export const useVisible = (): boolean => useContext(VisibleContext);
