"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Globe, ChevronDown } from "lucide-react";

interface SettingsViewProps {
  onBack?: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
  });

  const [language, setLanguage] = useState<string>("en");
  const [loading, setLoading] = useState(true);

  // Fetch user profile from backend API
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const csrfToken = (window as any).csrf_token;

        // Fetch user details from backend API
        const response = await fetch(`/api/method/beveren_fsm.field_service_management.api.user.get_current_user`, {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Frappe-CSRF-Token": csrfToken,
          },
          credentials: "include",
        });

        if (response.ok) {
          const result = await response.json();
          const userData = result.message || {};

          setProfile({
            name: userData.full_name || userData.name || "User",
            email: userData.email || userData.name || "",
            phone: userData.phone || "",
            company: userData.company || "",
          });

          // Set language from user's language field, default to "en" if not set
          setLanguage(userData.language || "en");

          // Set initial RTL direction based on language
          if (userData.language === 'ar') {
            document.documentElement.dir = 'rtl';
            document.documentElement.lang = 'ar';
            document.body.style.direction = 'rtl';
          } else {
            document.documentElement.dir = 'ltr';
            document.documentElement.lang = userData.language || 'en';
            document.body.style.direction = 'ltr';
          }
        } else {
          // Fallback to basic info from frappe.boot
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bootUser = (window as any).frappe?.boot?.user;
          setProfile({
            name: bootUser?.full_name || bootUser?.name || "User",
            email: bootUser?.email || bootUser?.name || "",
            phone: bootUser?.phone || "",
            company: bootUser?.company || "",
          });
          setLanguage(bootUser?.language || "en");
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        // Fallback to basic info
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bootUser = (window as any).frappe?.boot?.user;
        setProfile({
          name: bootUser?.full_name || bootUser?.name || "User",
          email: bootUser?.email || bootUser?.name || "",
          phone: bootUser?.phone || "",
          company: bootUser?.company || "",
        });
        setLanguage(bootUser?.language || "en");
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  // Save language preference to backend API and update RTL
  useEffect(() => {
    if (!language || loading) return; // Don't save on initial load or if still loading

    // Update document direction for RTL support
    if (language === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
      document.body.style.direction = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = language;
      document.body.style.direction = 'ltr';
    }

    const saveLanguage = async () => {
      try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const csrfToken = (window as any).csrf_token;

        // Update user's language via backend API
        // Frappe methods use form data, not JSON body
        const formData = new URLSearchParams();
        formData.append("language", language);

        const response = await fetch(`/api/method/beveren_fsm.field_service_management.api.user.update_user_language`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Frappe-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: formData.toString(),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("Failed to save language preference:", errorData);
        }
      } catch (error) {
        console.error("Error saving language preference:", error);
      }
    };

    saveLanguage();
  }, [language, loading]);

  const languages = [
    { code: "en", label: "English" },
    { code: "ar", label: "العربية" },
  ];

  const currentLanguage = languages.find(l => l.code === language) || languages[0];

  return (
    <div className="flex flex-col gap-6 w-full h-full overflow-y-auto">
      <div className="w-full bg-gradient-to-b from-primary/80 via-primary/60 to-primary/20 text-primary-foreground shadow-md border-b border-primary/20">
        <div className="max-w-6xl mx-auto px-6 py-4 min-h-[70px] flex items-center justify-between">
          <div className="flex-1">
            {onBack && (
              <Button variant="secondary" onClick={onBack} className="whitespace-nowrap">
                ← Back
              </Button>
            )}
          </div>
          <div className="flex-1 text-center">
            <p className="text-sm uppercase tracking-[0.4em] opacity-80">Settings</p>
          </div>
          <div className="flex-1" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your personal information and contact details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="p-2 border border-input rounded-md bg-muted/20 text-foreground">
                {profile.name || "Loading..."}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company Name</Label>
              <div className="p-2 border border-input rounded-md bg-muted/20 text-foreground">
                {profile.company || "N/A"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="p-2 border border-input rounded-md bg-muted/20 text-foreground">
                {profile.email || "N/A"}
              </div>
            </div>
            {profile.phone && (
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="p-2 border border-input rounded-md bg-muted/20 text-foreground">
                  {profile.phone}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Language Selector Card */}
      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>Select your preferred language for the interface.</CardDescription>
        </CardHeader>
        <CardContent>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 w-full justify-between max-w-md">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  <span className="font-medium">{currentLanguage.label}</span>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
              {languages.map(lang => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className="cursor-pointer"
                >
                  {language === lang.code ? "✓ " : ""}{lang.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </div>
  );
}
