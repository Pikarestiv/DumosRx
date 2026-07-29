import { UseFormReturn } from "react-hook-form";
import { Lock } from "lucide-react";
import { motion } from "framer-motion";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface CloudAuthProps {
  form: UseFormReturn<any>;
  itemVariant: any;
}

export function CloudAuth({ form, itemVariant }: CloudAuthProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <motion.div variants={itemVariant}>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-gray-300">Password</FormLabel>
              <FormControl>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <Input
                    type="password"
                    placeholder="******"
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-primary/50 focus:ring-primary/20 h-11"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      </motion.div>

      <motion.div variants={itemVariant}>
        <FormField
          control={form.control}
          name="password_confirmation"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-gray-300">Confirm Password</FormLabel>
              <FormControl>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <Input
                    type="password"
                    placeholder="******"
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-primary/50 focus:ring-primary/20 h-11"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      </motion.div>
    </div>
  );
}
