import { UseFormReturn } from "react-hook-form";
import type { RegisterFormValues } from "../hooks/use-register-form";
import { User, ShieldCheck } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface LocalPosAuthProps {
  form: UseFormReturn<RegisterFormValues>;
  itemVariant: Variants;
}

export function LocalPosAuth({ form, itemVariant }: LocalPosAuthProps) {
  return (
    <motion.div variants={itemVariant} className="my-6">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-primary mb-1">
          Local POS Access
        </h4>
        <p className="text-xs text-gray-400 mb-4">
          These credentials are used by you and your staff to quickly
          log into the local desktop terminal, separately from your
          cloud web account.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Username</FormLabel>
                <FormControl>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="jdoe_rx"
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-primary/50 focus:ring-primary/20 h-11"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pin"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">
                  Terminal PIN (4 Digits)
                </FormLabel>
                <FormControl>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="1234"
                      maxLength={4}
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-primary/50 focus:ring-primary/20 h-11 font-mono tracking-widest"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}
