import { useParams } from "react-router-dom";
import { ClientePerfilAdminContent } from "../ClientePerfilAdminContent.js";

export function ClientePerfilAdminPage() {
  const { id = "" } = useParams();
  if (!id) {
    return <p className="error">Cliente no especificado</p>;
  }
  return <ClientePerfilAdminContent customerId={id} layout="page" />;
}
