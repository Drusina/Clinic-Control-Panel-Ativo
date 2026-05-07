import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

export default function EditClinic() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (id) setLocation(`/admin/clinicas/${id}`, { replace: true });
  }, [id, setLocation]);

  return null;
}
