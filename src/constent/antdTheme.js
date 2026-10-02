import { panelTheme } from '@/utils/trust/trustStore';

// NOTE: `themeAntd` holds the ORIGINAL colours. TrustThemeProvider re-colours it
// (theme.js → recolor) when different theme colours are chosen.
export const themeAntd={
            token: {
              // Primary Colors - Rose-Pink for love & trust
              colorPrimary: "#db2777",           // Rose-600
              colorPrimaryBg: "#fff1f2",         // Rose-50
              colorPrimaryBgHover: "#ffe4e6",    // Rose-100
              colorPrimaryBorder: "#fecdd3",     // Rose-200
              colorPrimaryBorderHover: "#fda4af", // Rose-300
              colorPrimaryHover: "#be185d",      // Rose-700
              colorPrimaryActive: "#9f1239",     // Rose-800
              colorPrimaryTextHover: "#be185d",
              colorPrimaryText: "#db2777",
              colorPrimaryTextActive: "#9f1239",
              
              // Status Colors - Vibrant and clear
              colorSuccess: "#16a34a",           // Green-600
              colorSuccessBg: "#f0fdf4",         // Green-50
              colorSuccessBorder: "#bbf7d0",     // Green-200
              
              colorWarning: "#f59e0b",           // Amber-500
              colorWarningBg: "#fffbeb",         // Amber-50
              colorWarningBorder: "#fde68a",     // Amber-200
              
              colorError: "#dc2626",             // Red-600
              colorErrorBg: "#fef2f2",           // Red-50
              colorErrorBorder: "#fecaca",       // Red-200
              
              colorInfo: "#2563eb",              // Blue-600
              colorInfoBg: "#eff6ff",            // Blue-50
              colorInfoBorder: "#bfdbfe",        // Blue-200
              
              // Background & Surfaces
              colorBgBase: "#fff8f5",            // Soft peachy white
              colorBgContainer: "#ffffff",       // Pure white
              colorBgElevated: "#ffffff",        // Elevated surfaces
              colorBgLayout: "#fef2ed",          // Layout background
              // colorBgSpotlight: "#fff1f2",       // Spotlight areas (Rose-50)
              
              // Text Colors
              colorTextBase: "#3e1f1a",          // Deep warm brown
              colorText: "#3e1f1a",              // Primary text
              colorTextSecondary: "#6b4f47",     // Secondary text (medium warm brown)
              colorTextTertiary: "#8b7871",      // Tertiary text (soft brown-gray)
              colorTextQuaternary: "#a8998f",    // Quaternary text
              colorTextDescription: "#6b4f47",   // Description text
              colorTextHeading: "#2d1810",       // Heading text (darker)
              colorTextLabel: "#6b4f47",         // Label text
              colorTextPlaceholder: "#a8998f",   // Placeholder text
              colorTextDisabled: "#d4cbc5",      // Disabled text
              
              // Icon Colors
              colorIcon: "#8b7871",              // Default icon
              colorIconHover: "#6b4f47",         // Icon hover
              
              // Borders
              colorBorder: "#fde2d8",            // Soft peach
              colorBorderSecondary: "#fcd1c2",   // Slightly darker peach
              colorBorderBg: "#fef2ed",          // Border background
              
              // Fills & Backgrounds
              colorFill: "#fef2ed",              // Light fill
              colorFillSecondary: "#fde2d8",     // Secondary fill
              colorFillTertiary: "#fcd1c2",      // Tertiary fill
              colorFillQuaternary: "#fbb8a8",    // Quaternary fill
              
              // Border Radius - Soft and welcoming
              borderRadius: 12,
              borderRadiusLG: 16,
              borderRadiusSM: 8,
              borderRadiusXS: 6,
              
              // Shadows - Warm and subtle
              boxShadow: "0 2px 8px rgba(219, 39, 119, 0.08)",
              boxShadowSecondary: "0 4px 12px rgba(219, 39, 119, 0.10)",
              boxShadowTertiary: "0 1px 4px rgba(219, 39, 119, 0.06)",
              
              // Font Family
              fontFamily: "var(--font-geist-sans), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontFamilyCode: "var(--font-geist-mono), 'Fira Code', monospace",
              
              // Font Sizes
              fontSize: 14,
              fontSizeLG: 16,
              fontSizeSM: 12,
              fontSizeXL: 18,
              fontSizeHeading1: 38,
              fontSizeHeading2: 30,
              fontSizeHeading3: 24,
              fontSizeHeading4: 20,
              fontSizeHeading5: 16,
              
              // Line Height
              lineHeight: 1.6,
              lineHeightLG: 1.7,
              lineHeightSM: 1.5,
              lineHeightHeading1: 1.2,
              lineHeightHeading2: 1.3,
              lineHeightHeading3: 1.4,
              
              // Spacing & Control Heights
              controlHeight: 40,
              controlHeightLG: 48,
              controlHeightSM: 32,
              controlHeightXS: 24,
              
              // Padding
              padding: 16,
              paddingLG: 24,
              paddingSM: 12,
              paddingXS: 8,
              paddingXXS: 4,
              
              // Margin
              margin: 16,
              marginLG: 24,
              marginSM: 12,
              marginXS: 8,
              marginXXS: 4,
              
              // Link Colors
              colorLink: "#db2777",              // Rose-600
              colorLinkHover: "#be185d",         // Rose-700
              colorLinkActive: "#9f1239",        // Rose-800
              
              // Highlight & Selection
              colorHighlight: "#fda4af",         // Rose-300
              
              // Motion
              motionDurationFast: "0.1s",
              motionDurationMid: "0.2s",
              motionDurationSlow: "0.3s",
              
              // Z-Index
              zIndexBase: 0,
              zIndexPopupBase: 1000,
              
              // Opacity
              opacityLoading: 0.65,
            },
            components: {
                Tooltip: {
      colorBgDefault: "#db2777", // 🔥 tooltip bg
      colorText: "#ffffff",     // 🔥 tooltip text
    },
              // Button Component
              Button: {
                primaryShadow: "0 2px 8px rgba(219, 39, 119, 0.15)",
                defaultShadow: "0 1px 4px rgba(62, 31, 26, 0.08)",
                colorPrimaryHover: "#be185d",
                colorPrimaryActive: "#9f1239",
                contentFontSize: 14,
                contentFontSizeLG: 16,
                contentFontSizeSM: 12,
                borderRadius: 10,
                borderRadiusLG: 12,
                borderRadiusSM: 8,
                controlHeight: 40,
                controlHeightLG: 48,
                controlHeightSM: 32,
                paddingContentHorizontal: 20,
                fontWeight: 500,
              },
              
              // Card Component
              Card: {
                boxShadowTertiary: "0 1px 4px rgba(45, 24, 16, 0.04)",
                borderRadiusLG: 16,
                headerBg: "transparent",
                headerFontSize: 18,
                headerFontSizeSM: 16,
                headerHeight: 56,
                headerHeightSM: 48,
                paddingLG: 24,
                padding: 20,
              },
              
              // Input Component
              Input: {
                colorBorder: "#fecdd3",          // Rose-200
                colorBgContainer: "#ffffff",
                borderRadius: 10,
                borderRadiusLG: 12,
                borderRadiusSM: 8,
                controlHeight: 40,
                controlHeightLG: 48,
                controlHeightSM: 32,
                paddingBlock: 8,
                paddingInline: 12,
                hoverBorderColor: "#fda4af",     // Rose-300
                activeBorderColor: "#db2777",    // Rose-600
                activeShadow: "0 0 0 2px rgba(219, 39, 119, 0.1)",
              },
              
              // Select Component
              Select: {
                colorBorder: "#fecdd3",
                borderRadius: 10,
                controlHeight: 40,
                controlHeightLG: 48,
                optionSelectedBg: "#fff1f2",     // Rose-50
                optionSelectedColor: "#db2777",
                optionActiveBg: "#ffe4e6",       // Rose-100
              },
              
              // Table Component
              Table: {
                borderColor: "#fde2d8",
                headerBg: "#fff1f2",             // Rose-50
                headerColor: "#3e1f1a",
                headerSplitColor: "#fecdd3",
                rowHoverBg: "#ffe4e6",           // Rose-100
                headerBorderRadius: 12,
                borderRadius: 12,
                cellPaddingBlock: 16,
                cellPaddingInline: 16,
                fontSize: 14,
              },
              
              // Menu Component
              Menu: {
                itemBg: "transparent",
                itemSelectedBg: "#fff1f2",       // Rose-50
                itemSelectedColor: "#db2777",
                itemHoverBg: "#ffe4e6",          // Rose-100
                itemHoverColor: "#be185d",
                itemActiveBg: "#fecdd3",         // Rose-200
                horizontalItemSelectedColor: "#db2777",
                itemBorderRadius: 8,
                iconSize: 16,
                collapsedIconSize: 16,
              },
              
              // Modal Component
              Modal: {
                contentBg: "#ffffff",
                headerBg: "#fff1f2",             // Rose-50
                borderRadiusLG: 16,
                boxShadow: "0 6px 16px 0 rgba(219, 39, 119, 0.12)",
                titleFontSize: 20,
                titleLineHeight: 1.4,
              },
              
              // Tabs Component
              Tabs: {
                itemSelectedColor: "#db2777",
                itemHoverColor: "#be185d",
                itemActiveColor: "#9f1239",
                inkBarColor: "#db2777",
                cardBg: "#fff1f2",
                borderRadius: 10,
              },
              
              // Tag Component
              Tag: {
                defaultBg: "#fef2ed",
                defaultColor: "#6b4f47",
                borderRadiusSM: 6,
              },
              
              // Badge Component
              Badge: {
                dotSize: 8,
                textFontSize: 12,
                textFontSizeSM: 10,
                statusSize: 8,
              },
              
              // Pagination Component
              Pagination: {
                itemActiveBg: "#db2777",
                itemActiveBgDisabled: "#fecdd3",
                borderRadius: 8,
                itemColor:'#fff',
              itemActiveColor:"#fff",
              itemActiveColorHover:"#fff"

              },
              
              // Alert Component
              Alert: {
                borderRadiusLG: 12,
                withDescriptionIconSize: 24,
              },
              
              // Form Component
              Form: {
                labelColor: "#6b4f47",
                labelFontSize: 14,
                labelHeight: 32,
                labelColonMarginInlineStart: 2,
                labelColonMarginInlineEnd: 8,
                itemMarginBottom: 24,
              },
              
              // Notification Component
              Notification: {
                width: 384,
                borderRadiusLG: 12,
              },
              
              // Drawer Component
              Drawer: {
                footerPaddingBlock: 16,
                footerPaddingInline: 24,
              },
              
              // Breadcrumb Component
              Breadcrumb: {
                itemColor: "#8b7871",
                lastItemColor: "#3e1f1a",
                linkColor: "#db2777",
                linkHoverColor: "#be185d",
                separatorColor: "#a8998f",
              },
              
              // Steps Component
              Steps: {
                colorPrimary: "#db2777",
                dotSize: 32,
                iconSize: 32,
                iconSizeSM: 24,
              },
              
              // Progress Component
              Progress: {
                defaultColor: "#db2777",
                remainingColor: "#fde2d8",
                circleTextColor: "#3e1f1a",
              },
              
              // Switch Component
              Switch: {
                handleSize: 18,
                trackHeight: 22,
                trackMinWidth: 44,
                innerMinMargin: 4,
                innerMaxMargin: 24,
              },
              
              // Radio Component
              Radio: {
                dotSize: 8,
                radioSize: 16,
              },
              
              // Checkbox Component
              Checkbox: {
                size: 16,
                borderRadiusSM: 4,
              },
              
              // Slider Component
              Slider: {
                trackBg: "#fde2d8",
                trackHoverBg: "#fcd1c2",
                handleColor: "#db2777",
                handleActiveColor: "#be185d",
                dotBorderColor: "#fecdd3",
                railBg: "#fef2ed",
                railHoverBg: "#fde2d8",
              },
              
              // DatePicker Component
              DatePicker: {
                cellHoverBg: "#ffe4e6",          // Rose-100
                cellActiveWithRangeBg: "#fff1f2", // Rose-50
                cellRangeBorderColor: "#fecdd3",
                cellBgDisabled: "#fef2ed",
                timeColumnWidth: 64,
                panelWidth: 280,
              },
              
              // Upload Component
              Upload: {
                actionsColor: "#db2777",
              },
            },
          }

          // Live panel colours (Settings → Trust Details → Colours)
export const Colors = {
  get primary() { return panelTheme().primary; },
  get primaryL() { return panelTheme().primaryLight; },
  get primaryD() { return panelTheme().primaryDark; },
  get secondary() { return panelTheme().secondary; },
  get secondaryL() { return panelTheme().secondaryLight; },
  accent:    '#059669',
  accentL:   '#34d399',
  tertiary:  '#f59e0b',
  get bg() { return panelTheme().background; },
  surface:   '#ffffff',
  get surfaceSec() { return panelTheme().surfaceSecondary; },
  get fg() { return panelTheme().foreground; },
  get fgSec() { return panelTheme().foregroundSecondary; },
  get muted() { return panelTheme().muted; },
  get border() { return panelTheme().border; },
  success:   '#16a34a',
  warning:   '#f59e0b',
  error:     '#dc2626',
  info:      '#2563eb',
}



export const sideBarStyle=`
        /* User Info Styles */
        .user-info {
          padding: 16px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(135deg, var(--surface-secondary) 0%, var(--background) 100%);
          margin: 0 8px;
          border-radius: 12px;
          margin-top: 16px;
          margin-bottom: 16px;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .user-avatar {
          width: 60px;
          height: 60px;
          margin: 0 auto 12px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: white;
          overflow: hidden;
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.25);
        }

        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-details {
          text-align: center;
        }

        .user-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--foreground);
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          margin-bottom: 8px;
        }

        .user-email {
          font-size: 12px;
          color: var(--muted-foreground);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* No Access Message */
        .no-access-message {
          padding: 40px 16px;
          text-align: center;
          color: var(--muted-foreground);
        }

        .no-access-icon {
          font-size: 48px;
          color: var(--border-hover);
          margin-bottom: 16px;
          display: block;
        }

        .no-access-message p {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 4px;
          color: var(--foreground-secondary);
        }

        .no-access-message small {
          font-size: 12px;
          color: #b5a29a;
        }

        /* Disabled Menu Items */
        .custom-menu .ant-menu-item-disabled,
        .custom-menu .ant-menu-submenu-disabled {
          opacity: 0.5 !important;
          cursor: not-allowed !important;
        }

        .custom-menu .ant-menu-item-disabled:hover,
        .custom-menu .ant-menu-submenu-disabled:hover {
          background: transparent !important;
          transform: none !important;
        }

        /* Permission Indicator */
        .permission-indicator {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
        }

        .permission-indicator.partial {
          background: #f59e0b;
        }

        .permission-indicator.none {
          background: #dc2626;
        }

        /* Sidebar Custom Styles */
        .sidebar-custom {
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1) !important;
        }

        .sidebar-custom::-webkit-scrollbar {
          width: 6px;
        }

        .sidebar-custom::-webkit-scrollbar-track {
          background: transparent;
        }

        .sidebar-custom::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 3px;
          transition: background 0.3s ease;
        }

        .sidebar-custom::-webkit-scrollbar-thumb:hover {
          background: var(--border-hover);
        }

        /* Header Styles */
        .sidebar-header {
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .sidebar-header::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
          animation: headerGlow 8s ease-in-out infinite;
        }

        @keyframes headerGlow {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(10%, 10%); }
        }

        .logo-container {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.4s cubic-bezier(0.645, 0.045, 0.355, 1);
          position: relative;
          z-index: 1;
        }

        .logo-content {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 0 8px;
          animation: logoSlideIn 0.5s ease-out;
        }

        @keyframes logoSlideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: #ffffff;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3);
          transition: all 0.3s ease;
          animation: iconPulse 2s ease-in-out infinite;
        }

        @keyframes iconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .logo-icon:hover {
          transform: scale(1.1) rotate(5deg);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }

        .logo-icon.collapsed {
          width: 48px;
          height: 48px;
        }

        .logo-text {
          flex: 1;
          min-width: 0;
        }

        .logo-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.2;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .logo-subtitle {
          margin: 0;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 500;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* Collapse Trigger */
        .collapse-trigger {
          position: absolute;
          top: 88px;
          right: -12px;
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #ffffff 0%, var(--background) 100%);
          border: 2px solid var(--border);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 101;
          box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.15), 0 1px 2px rgba(0, 0, 0, 0.05);
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
          font-size: 13px;
          color: var(--primary);
        }

        .collapse-trigger:hover {
          background: linear-gradient(135deg, var(--primary-50) 0%, var(--primary-100) 100%);
          border-color: var(--primary-200);
          transform: scale(1.15) rotate(180deg);
          box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.25), 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .collapse-trigger:active {
          transform: scale(1.05) rotate(180deg);
        }

        /* Menu Container */
        .menu-container {
          padding: 16px 8px;
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .menu-container::-webkit-scrollbar {
          width: 6px;
        }

        .menu-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .menu-container::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 3px;
        }

        /* Menu Styles */
        .custom-menu {
          background: transparent !important;
          border: none !important;
        }

        .custom-menu .ant-menu-item,
        .custom-menu .ant-menu-submenu-title {
          height: 44px !important;
          line-height: 44px !important;
          margin: 6px 0 !important;
          padding: 0 16px !important;
          border-radius: 12px !important;
          color: var(--foreground-secondary) !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1) !important;
          position: relative !important;
          overflow: visible !important;
        }

        /* Animated border on left */
        .custom-menu .ant-menu-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 0;
          width: 4px;
          background: linear-gradient(180deg, var(--primary) 0%, var(--secondary) 100%);
          border-radius: 0 4px 4px 0;
          transition: height 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
          box-shadow: 2px 0 4px rgba(var(--primary-rgb), 0.3);
        }

        .custom-menu .ant-menu-item-selected::before,
        .custom-menu .ant-menu-item:hover::before {
          height: 60%;
        }

        /* Hover Effects */
        .custom-menu .ant-menu-item:hover,
        .custom-menu .ant-menu-submenu-title:hover {
          background: linear-gradient(90deg, var(--primary-100) 0%, transparent 100%) !important;
          color: var(--primary-dark) !important;
          transform: translateX(4px);
        }

        /* Selected State */
        .custom-menu .ant-menu-item-selected {
          background: linear-gradient(90deg, var(--primary-50) 0%, color-mix(in srgb, var(--primary-50) 30%, transparent) 100%) !important;
          color: var(--primary) !important;
          font-weight: 600 !important;
          box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.08);
        }

        .custom-menu .ant-menu-item-selected .anticon,
        .custom-menu .ant-menu-item-selected span {
          color: var(--primary) !important;
        }

        /* Submenu Styles */
        .custom-menu .ant-menu-submenu-open > .ant-menu-submenu-title {
          color: var(--primary) !important;
          background: linear-gradient(90deg, var(--primary-50) 0%, color-mix(in srgb, var(--primary-50) 30%, transparent) 100%) !important;
        }

        .custom-menu .ant-menu-sub {
          background: linear-gradient(135deg, var(--surface-secondary) 0%, var(--background) 100%) !important;
          border-radius: 12px !important;
          margin: 4px 0 4px 12px !important;
          padding: 8px 0 !important;
          border-left: 2px solid var(--primary-200) !important;
          box-shadow: inset 2px 0 4px rgba(var(--primary-rgb), 0.05);
        }

        /* Icon Styles */
        .custom-menu .ant-menu-item .anticon,
        .custom-menu .ant-menu-submenu-title .anticon {
          font-size: 18px !important;
          margin-right: 12px !important;
          color: var(--muted-foreground) !important;
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1) !important;
        }

        .custom-menu .ant-menu-item:hover .anticon,
        .custom-menu .ant-menu-submenu-title:hover .anticon {
          color: var(--primary-dark) !important;
          transform: scale(1.15) rotate(5deg);
        }

        .custom-menu .ant-menu-item-selected .anticon {
          color: var(--primary) !important;
          animation: iconBounce 0.5s ease-out;
        }

        @keyframes iconBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }

        /* Submenu Arrow */
        .custom-menu .ant-menu-submenu-arrow {
          color: var(--muted-foreground) !important;
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1) !important;
        }

        .custom-menu .ant-menu-submenu-open > .ant-menu-submenu-title .ant-menu-submenu-arrow {
          color: var(--primary) !important;
        }

        /* Collapsed State - FIXED */
        .sidebar-custom.ant-layout-sider-collapsed .custom-menu .ant-menu-item,
        .sidebar-custom.ant-layout-sider-collapsed .custom-menu .ant-menu-submenu-title {
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 48px !important;
          margin: 8px 0 !important;
        }

        .sidebar-custom.ant-layout-sider-collapsed .custom-menu .ant-menu-item .anticon,
        .sidebar-custom.ant-layout-sider-collapsed .custom-menu .ant-menu-submenu-title .anticon {
          margin: 0 !important;
          font-size: 22px !important;
        }

        /* Tooltip Styling */
        .sidebar-tooltip .ant-tooltip-inner {
          background: linear-gradient(135deg, var(--foreground) 0%, #2d1810 100%) !important;
          color: #ffffff !important;
          border-radius: 8px !important;
          padding: 8px 12px !important;
          font-weight: 500 !important;
          font-size: 13px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        }

        /* Footer Styles */
        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--border);
          background: linear-gradient(135deg, var(--surface-secondary) 0%, var(--background) 100%);
          margin-top: auto;
          animation: fadeInUp 0.5s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .footer-content {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid var(--border);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
        }

        .footer-content:hover {
          background: linear-gradient(135deg, var(--primary-50) 0%, #ffffff 100%);
          border-color: var(--primary-200);
          transform: translateY(-3px);
          box-shadow: 0 6px 16px rgba(var(--primary-rgb), 0.15);
        }

        .footer-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: #ffffff;
          flex-shrink: 0;
          box-shadow: 0 4px 8px rgba(var(--primary-rgb), 0.25);
          transition: all 0.3s ease;
        }

        .footer-content:hover .footer-icon {
          transform: scale(1.1) rotate(10deg);
          box-shadow: 0 6px 12px rgba(var(--primary-rgb), 0.35);
        }

        .footer-text {
          flex: 1;
          min-width: 0;
        }

        .footer-title {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--foreground);
          line-height: 1.3;
        }

        .footer-subtitle {
          margin: 0;
          font-size: 11px;
          color: var(--muted-foreground);
          line-height: 1.3;
        }

        /* Smooth transitions for all interactive elements */
        .custom-menu .ant-menu-item,
        .custom-menu .ant-menu-submenu-title,
        .logo-icon,
        .collapse-trigger,
        .footer-content {
          will-change: transform;
        }
      `