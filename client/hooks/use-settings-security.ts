import { useState } from "react";
import { toast } from "sonner";

export function useSettingsSecurity(changePin: (current: string, newPin: string) => Promise<any>) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const handleUpdateSecurity = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      toast.error("All fields are required");
      return false;
    }
    if (newPin !== confirmPin) {
      toast.error("New PINs do not match");
      return false;
    }
    const result = await changePin(currentPin, newPin);
    if (result.success) {
      toast.success(result.message);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      return true;
    } else {
      toast.error(result.message);
      return false;
    }
  };

  return {
    currentPin,
    setCurrentPin,
    newPin,
    setNewPin,
    confirmPin,
    setConfirmPin,
    handleUpdateSecurity,
  };
}
