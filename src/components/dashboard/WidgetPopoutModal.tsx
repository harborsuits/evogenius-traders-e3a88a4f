import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface WidgetPopoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  badge?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export function WidgetPopoutModal({
  open,
  onOpenChange,
  title,
  badge,
  icon,
  children,
}: WidgetPopoutModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            {icon}
            <span>{title}</span>
            {badge && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                {badge}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
