"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Shield, Trash, Loader2 } from "lucide-react";
import type { CompanyRole } from "@nexis/types";
import { removeMember, updateMemberRole } from "./actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface MemberRowActionsProps {
  userId: string;
  companyId: string;
  currentRole: CompanyRole;
  memberName: string;
  currentUserRole: CompanyRole;
  currentUserId: string;
}

export function MemberRowActions({
  userId,
  companyId,
  currentRole,
  memberName,
  currentUserRole,
  currentUserId,
}: MemberRowActionsProps) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const [isUpdateOpen, setIsUpdateOpen] = React.useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = React.useState(false);
  const [selectedRole, setSelectedRole] = React.useState<CompanyRole>(currentRole);
  const [isPending, setIsPending] = React.useState(false);

  // Define role options for selector. Owners can select anything.
  // Admins can select admin, manager, employee.
  const roleOptions: CompanyRole[] = currentUserRole === "owner"
    ? ["owner", "admin", "manager", "employee"]
    : ["admin", "manager", "employee"];

  // Check if current user is authorized to perform actions on this member
  const canManage = React.useMemo(() => {
    if (userId === currentUserId) return false; // cannot edit/remove self
    if (currentUserRole === "owner") return true; // owners can manage everyone
    if (currentUserRole === "admin") {
      // admins can only manage managers and employees
      return currentRole === "manager" || currentRole === "employee";
    }
    return false;
  }, [userId, currentUserId, currentUserRole, currentRole]);

  if (!canManage) return null;

  const handleUpdateRole = async () => {
    setIsPending(true);
    try {
      const res = await updateMemberRole(companyId, userId, selectedRole);
      if (res.error) {
        toast.error(t(res.error) || res.error);
      } else {
        toast.success(t(res.success) || res.success);
        setIsUpdateOpen(false);
      }
    } catch (err) {
      toast.error("An error occurred");
    } finally {
      setIsPending(false);
    }
  };

  const handleRemove = async () => {
    setIsPending(true);
    try {
      const res = await removeMember(companyId, userId);
      if (res.error) {
        toast.error(t(res.error) || res.error);
      } else {
        toast.success(t(res.success) || res.success);
        setIsRemoveOpen(false);
      }
    } catch (err) {
      toast.error("An error occurred");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4 text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsUpdateOpen(true)}>
            <Shield className="mr-2 h-4 w-4 text-muted" />
            {t("changeRole")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsRemoveOpen(true)} className="text-danger focus:text-danger">
            <Trash className="mr-2 h-4 w-4 text-danger" />
            {t("remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Role Dialog */}
      <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("changeRole")}</DialogTitle>
            <DialogDescription>
              Select a new role for {memberName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold">{t("invite.role")}</label>
              <Select
                value={selectedRole}
                onValueChange={(val) => setSelectedRole(val as CompanyRole)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {tRoles(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateOpen(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button onClick={handleUpdateRole} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm Dialog */}
      <Dialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-danger">{t("remove")}</DialogTitle>
            <DialogDescription>
              {t("removeConfirm", { name: memberName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRemoveOpen(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
