import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface User {
  id: number;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0, // Don't cache auth data
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const isAuthenticated = !!user && !error;
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin'; // Support legacy 'admin' role
  const isHospitalAdmin = user?.role === 'hospital_admin';
  const hasAdminAccess = isSuperAdmin || isHospitalAdmin;
  const isAdmin = isSuperAdmin; // Legacy support, maps to super_admin

  return {
    user,
    isLoading,
    isAuthenticated,
    isSuperAdmin,
    isHospitalAdmin,
    hasAdminAccess,
    isAdmin, // Legacy support
    error,
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Logout failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Clear all auth-related queries
      queryClient.removeQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: "Success",
        description: "You have been logged out successfully.",
      });
      
      window.location.href = "/login";
    },
    onError: (error: any) => {
      toast({
        title: "Logout Failed",
        description: error.message || "Failed to logout.",
        variant: "destructive",
      });
    },
  });
}