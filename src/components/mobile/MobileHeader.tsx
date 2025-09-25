import React from 'react';
import { Button } from '@/components/ui/button';
import { Menu, Bell, User, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  showMenu?: boolean;
  onMenuClick?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  subtitle,
  showMenu = true,
  onMenuClick,
}) => {
  return (
    <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-none border-0 shadow-lg">
      <div className="flex items-center justify-between p-4">
        {/* Left: Menu & Logo */}
        <div className="flex items-center gap-3">
          {showMenu && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={onMenuClick}
            >
              <Menu className="h-6 w-6" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{title}</h1>
              {subtitle && (
                <p className="text-sm text-blue-100">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};