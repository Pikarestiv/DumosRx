import { UseFormReturn } from "react-hook-form";
import type { RegisterFormValues } from "../hooks/use-register-form";
import { Mail, Phone } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface PersonalDetailsProps {
  form: UseFormReturn<RegisterFormValues>;
  itemVariant: Variants;
}

export function PersonalDetails({ form, itemVariant }: PersonalDetailsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={itemVariant}>
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">First Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="John"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-primary/50 focus:ring-primary/20 h-11"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />
        </motion.div>

        <motion.div variants={itemVariant}>
          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Last Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Doe"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-primary/50 focus:ring-primary/20 h-11"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={itemVariant}>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Email Address</FormLabel>
                <FormControl>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="name@example.com"
                      type="email"
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
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Phone Number</FormLabel>
                <FormControl>
                  <div className="relative group">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="08012345678"
                      type="tel"
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
    </>
  );
}
