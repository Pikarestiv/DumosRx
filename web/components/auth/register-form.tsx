"use client";

import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StoreDetails } from "./register-form-fields/store-details";
import { PersonalDetails } from "./register-form-fields/personal-details";
import { CloudAuth } from "./register-form-fields/cloud-auth";
import { LocalPosAuth } from "./register-form-fields/local-pos-auth";
import { useRegisterForm } from "./hooks/use-register-form";

export function RegisterForm() {
  const { form, loading, error, onSubmit } = useRegisterForm();


  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="w-full">
      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6"
        >
          <Alert
            variant="destructive"
            className="bg-destructive/10 border-destructive/20 text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Registration Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </motion.div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            <StoreDetails form={form} itemVariant={item} />
            <PersonalDetails form={form} itemVariant={item} />
            <CloudAuth form={form} itemVariant={item} />
            <LocalPosAuth form={form} itemVariant={item} />

            <motion.div variants={item} className="pt-4">
              <Button
                type="submit"
                className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  "Create Secure Account"
                )}
              </Button>
            </motion.div>

            <motion.div variants={item} className="text-center pt-2">
              <p className="text-sm text-gray-500">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-bold text-accent/80 hover:text-accent transition-colors cursor-pointer"
                >
                  Sign In
                </Link>
              </p>
            </motion.div>
          </motion.div>
        </form>
      </Form>
    </div>
  );
}
