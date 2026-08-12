import {
  CheckCircle,
  DotsThree,
  FileText,
  GearSix,
  MagnifyingGlass,
  Plus,
  Trash,
  WarningCircle
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@renderer/components/ui/breadcrumb'
import { Button } from '@renderer/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '@renderer/components/ui/button-group'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@renderer/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@renderer/components/ui/command'
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle
} from '@renderer/components/ui/confirmation'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { Conversation, ConversationContent, ConversationEmptyState, ConversationItem } from '@renderer/components/ui/conversation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { EmptyState } from '@renderer/components/ui/empty'
import { Input } from '@renderer/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText
} from '@renderer/components/ui/input-group'
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageToolbar
} from '@renderer/components/ui/message'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorShortcut,
  ModelSelectorTrigger
} from '@renderer/components/ui/model-selector'
import {
  PromptInput,
  PromptInputAddAttachmentButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools
} from '@renderer/components/ui/prompt-input'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@renderer/components/ui/reasoning'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@renderer/components/ui/sheet'
import { Shimmer } from '@renderer/components/ui/shimmer'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger
} from '@renderer/components/ui/sidebar'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, ToolStatusBadge } from '@renderer/components/ui/tool'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { CodeText, Heading, Kbd, Text } from '@renderer/components/ui/typography'
import { useAppearance } from '@renderer/appearance-provider'

import { SettingsPageHeader } from './settings-page-header'
import { SettingsRow } from './settings-row'
import { SettingsSection } from './settings-section'

type DebugThemePreview = 'light' | 'dark' | 'dark-high-contrast'
type DebugFontFamily =
  | 'system'
  | 'geist'
  | 'sf-pro'
  | 'inter'
  | 'helvetica'
  | 'arial'
  | 'sf-mono'
  | 'menlo'
  | 'monaco'
  | 'jetbrains-mono'
  | 'monospace'
type UiDebugTab = 'primitives' | 'ai' | 'typography' | 'components'

export function UiDebugPage(): React.JSX.Element {
  const [switchEnabled, setSwitchEnabled] = useState(true)
  const [selectedTab, setSelectedTab] = useState<UiDebugTab>('primitives')
  const { resolvedTheme } = useAppearance()
  const [debugThemePreview, setDebugThemePreview] = useState<DebugThemePreview>(
    resolvedTheme === 'dark' ? 'dark' : 'light'
  )
  const [useThinFontSmoothing, setUseThinFontSmoothing] = useState(false)
  const [debugFontFamily, setDebugFontFamily] = useState<DebugFontFamily>('system')

  useEffect(() => {
    const root = document.documentElement

    root.classList.toggle('dark', debugThemePreview !== 'light')
    root.classList.toggle('dark-high-contrast', debugThemePreview === 'dark-high-contrast')
    root.classList.toggle('font-family-system', debugFontFamily === 'system')
    root.classList.toggle('font-family-geist', debugFontFamily === 'geist')
    root.classList.toggle('font-family-sf-pro', debugFontFamily === 'sf-pro')
    root.classList.toggle('font-family-inter', debugFontFamily === 'inter')
    root.classList.toggle('font-family-helvetica', debugFontFamily === 'helvetica')
    root.classList.toggle('font-family-arial', debugFontFamily === 'arial')
    root.classList.toggle('font-family-sf-mono', debugFontFamily === 'sf-mono')
    root.classList.toggle('font-family-menlo', debugFontFamily === 'menlo')
    root.classList.toggle('font-family-monaco', debugFontFamily === 'monaco')
    root.classList.toggle('font-family-jetbrains-mono', debugFontFamily === 'jetbrains-mono')
    root.classList.toggle('font-family-monospace', debugFontFamily === 'monospace')
    root.classList.toggle('font-smoothing-native', !useThinFontSmoothing)
    root.classList.toggle('font-smoothing-antialiased', useThinFontSmoothing)
    root.style.colorScheme = debugThemePreview === 'light' ? 'light' : 'dark'

    return () => {
      root.classList.toggle('dark', resolvedTheme === 'dark')
      root.classList.remove('dark-high-contrast')
      root.classList.remove('font-family-system')
      root.classList.remove('font-family-geist')
      root.classList.remove('font-family-sf-pro')
      root.classList.remove('font-family-inter')
      root.classList.remove('font-family-helvetica')
      root.classList.remove('font-family-arial')
      root.classList.remove('font-family-sf-mono')
      root.classList.remove('font-family-menlo')
      root.classList.remove('font-family-monaco')
      root.classList.remove('font-family-jetbrains-mono')
      root.classList.remove('font-family-monospace')
      root.classList.remove('font-smoothing-native')
      root.classList.remove('font-smoothing-antialiased')
      root.style.colorScheme = resolvedTheme
    }
  }, [debugFontFamily, debugThemePreview, resolvedTheme, useThinFontSmoothing])

  return (
    <>
      <Heading as="h2" level="h2" className="mb-2">
        UI Debug
      </Heading>
      <Text variant="muted" className="mb-6">
        Debug-only gallery for installed shadcn and shadcn-compatible primitives.
      </Text>

      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 text-card-foreground">
        <div>
          <p className="text-sm font-medium">Theme preview</p>
          <p className="text-xs text-muted-foreground">
            Preview light, dark, and dark high contrast without changing saved settings.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Select
            value={debugThemePreview}
            onValueChange={(value) => setDebugThemePreview(value as DebugThemePreview)}
          >
            <SelectTrigger className="w-44" aria-label="UI debug theme preview">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="dark-high-contrast">Dark high contrast</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={debugFontFamily}
            onValueChange={(value) => setDebugFontFamily(value as DebugFontFamily)}
          >
            <SelectTrigger className="w-44" aria-label="UI debug font family preview">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System font</SelectItem>
              <SelectItem value="geist">Geist</SelectItem>
              <SelectItem value="sf-pro">SF Pro Text</SelectItem>
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="helvetica">Helvetica Neue</SelectItem>
              <SelectItem value="arial">Arial</SelectItem>
              <SelectItem value="sf-mono">SF Mono</SelectItem>
              <SelectItem value="menlo">Menlo</SelectItem>
              <SelectItem value="monaco">Monaco</SelectItem>
              <SelectItem value="jetbrains-mono">JetBrains Mono</SelectItem>
              <SelectItem value="monospace">Generic monospace</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Use thin font anti-aliasing</span>
            <Switch
              size="sm"
              aria-label="Toggle thin font anti-aliasing preview"
              checked={useThinFontSmoothing}
              onCheckedChange={(checked) => setUseThinFontSmoothing(Boolean(checked))}
            />
          </label>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        <DebugTabButton
          active={selectedTab === 'primitives'}
          onClick={() => setSelectedTab('primitives')}
        >
          Primitive
        </DebugTabButton>
        <DebugTabButton
          active={selectedTab === 'ai'}
          onClick={() => setSelectedTab('ai')}
        >
          AI Components
        </DebugTabButton>
        <DebugTabButton
          active={selectedTab === 'typography'}
          onClick={() => setSelectedTab('typography')}
        >
          Typography
        </DebugTabButton>
        <DebugTabButton
          active={selectedTab === 'components'}
          onClick={() => setSelectedTab('components')}
        >
          Components
        </DebugTabButton>
      </div>

      {selectedTab === 'primitives' ? <PrimitiveDebugContent switchEnabled={switchEnabled} setSwitchEnabled={setSwitchEnabled} /> : null}
      {selectedTab === 'ai' ? <AiComponentsDebugContent /> : null}
      {selectedTab === 'typography' ? <TypographyDebugContent /> : null}
      {selectedTab === 'components' ? <ComponentsDebugContent /> : null}
    </>
  )
}

function PrimitiveDebugContent({
  switchEnabled,
  setSwitchEnabled
}: {
  switchEnabled: boolean
  setSwitchEnabled: (enabled: boolean) => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <DebugRow title="alert">
          <Alert>
            <CheckCircle className="size-4" />
            <AlertTitle>Default alert</AlertTitle>
            <AlertDescription>Status note with optional action.</AlertDescription>
            <AlertAction><Button size="xs" variant="outline">Action</Button></AlertAction>
          </Alert>
          <Alert variant="destructive">
            <WarningCircle className="size-4" />
            <AlertTitle>Destructive alert</AlertTitle>
            <AlertDescription>Failure or risky operation state.</AlertDescription>
          </Alert>
        </DebugRow>

        <DebugRow title="avatar">
          <Avatar>
            <AvatarImage src="" alt="" />
            <AvatarFallback>SZ</AvatarFallback>
          </Avatar>
        </DebugRow>

        <DebugRow title="badge">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </DebugRow>

        <DebugRow title="breadcrumb">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Workspace</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>Settings</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>UI Debug</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </DebugRow>

        <DebugRow title="button">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="icon-sm" aria-label="More actions"><DotsThree /></Button>
        </DebugRow>

        <DebugRow title="button-group">
          <ButtonGroup>
            <Button variant="outline">One</Button>
            <ButtonGroupSeparator />
            <ButtonGroupText>Grouped</ButtonGroupText>
            <Button variant="outline">Two</Button>
          </ButtonGroup>
        </DebugRow>

        <DebugRow title="card">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Agent Work Session</CardTitle>
              <CardDescription>Card title, description, action, content, and footer.</CardDescription>
              <CardAction><Badge variant="outline">Running</Badge></CardAction>
            </CardHeader>
            <CardContent>Card content using current card tokens.</CardContent>
            <CardFooter className="border-t"><Button size="sm">Open</Button></CardFooter>
          </Card>
        </DebugRow>

        <DebugRow title="collapsible">
          <Collapsible defaultOpen className="w-full max-w-md">
            <CollapsibleTrigger className="rounded-md border px-3 py-2 text-sm">Toggle details</CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Collapsible content.
            </CollapsibleContent>
          </Collapsible>
        </DebugRow>

        <DebugRow title="command">
          <Command className="h-56 max-w-md border">
            <CommandInput placeholder="Search commands..." />
            <CommandList>
              <CommandEmpty>No command found.</CommandEmpty>
              <CommandGroup heading="Workspace">
                <CommandItem><FileText className="size-4" /> Open file <CommandShortcut>⌘P</CommandShortcut></CommandItem>
                <CommandItem><GearSix className="size-4" /> Open settings</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Agent"><CommandItem>Start agent session</CommandItem></CommandGroup>
            </CommandList>
          </Command>
        </DebugRow>

        <DebugRow title="context-menu">
          <ContextMenu>
            <ContextMenuTrigger>
              <div className="w-full max-w-md rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Right-click for context menu
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Open</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </DebugRow>

        <DebugRow title="dialog">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
                <DialogDescription>Dialog description text.</DialogDescription>
              </DialogHeader>
              <DialogFooter><Button>Confirm</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </DebugRow>

        <DebugRow title="dropdown-menu">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Open menu</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem><Plus className="size-4" /> New <DropdownMenuShortcut>⌘N</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuCheckboxItem checked>Enabled</DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value="agent">
                <DropdownMenuRadioItem value="agent">Agent</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="builder">Builder</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuItem variant="destructive"><Trash className="size-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DebugRow>

        <DebugRow title="input">
          <Input className="max-w-md" placeholder="Input" />
        </DebugRow>

        <DebugRow title="input-group">
          <InputGroup className="max-w-md">
            <InputGroupAddon><MagnifyingGlass className="size-4" /></InputGroupAddon>
            <InputGroupInput placeholder="Input group" />
            <InputGroupAddon align="inline-end"><InputGroupButton>Go</InputGroupButton></InputGroupAddon>
          </InputGroup>
          <InputGroup className="max-w-md">
            <InputGroupAddon align="block-start" className="border-b"><InputGroupText>Prompt</InputGroupText></InputGroupAddon>
            <Textarea placeholder="Textarea inside input group" />
          </InputGroup>
        </DebugRow>

        <DebugRow title="select">
          <Select defaultValue="sonnet">
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Models</SelectLabel>
                <SelectItem value="sonnet">Claude Sonnet</SelectItem>
                <SelectItem value="opus">Claude Opus</SelectItem>
                <SelectSeparator />
                <SelectItem value="gpt">GPT</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </DebugRow>

        <DebugRow title="separator"><Separator className="max-w-md" /></DebugRow>

        <DebugRow title="sheet">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Sheet title</SheetTitle>
                <SheetDescription>Sheet description text.</SheetDescription>
              </SheetHeader>
              <SheetFooter><Button>Done</Button></SheetFooter>
            </SheetContent>
          </Sheet>
        </DebugRow>

        <DebugRow title="shimmer"><Shimmer>Streaming placeholder shimmer</Shimmer></DebugRow>

        <DebugRow title="sidebar">
          <SidebarProvider>
            <div className="h-48 w-full max-w-md overflow-hidden rounded-lg border bg-sidebar text-sidebar-foreground">
              <Sidebar collapsible="none" className="relative h-full w-full">
                <SidebarHeader><SidebarInput placeholder="Search" /></SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupLabel>Sidebar</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton isActive><FileText /> <span>Files</span></SidebarMenuButton>
                          <SidebarMenuBadge>3</SidebarMenuBadge>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                  <SidebarSeparator />
                  <SidebarTrigger />
                </SidebarContent>
              </Sidebar>
            </div>
          </SidebarProvider>
        </DebugRow>

        <DebugRow title="skeleton"><Skeleton className="h-8 w-full max-w-md" /></DebugRow>

        <DebugRow title="switch">
          <Switch checked={switchEnabled} onCheckedChange={(value) => setSwitchEnabled(Boolean(value))} />
          <span className="text-sm text-muted-foreground">Switch is {switchEnabled ? 'on' : 'off'}</span>
        </DebugRow>

        <DebugRow title="textarea"><Textarea className="max-w-md" placeholder="Textarea" /></DebugRow>

        <DebugRow title="tooltip">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
              <TooltipContent>Tooltip content</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </DebugRow>
    </div>
  )
}

function AiComponentsDebugContent(): React.JSX.Element {
  return (
    <div className="space-y-4">
        <DebugRow title="confirmation">
          <Confirmation approval={{ id: 'debug-confirmation' }} state="approval-requested" className="max-w-md">
            <ConfirmationTitle>Allow agent to run pnpm test?</ConfirmationTitle>
            <ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction variant="outline">Reject</ConfirmationAction>
                <ConfirmationAction>Approve</ConfirmationAction>
              </ConfirmationActions>
            </ConfirmationRequest>
          </Confirmation>
        </DebugRow>

        <DebugRow title="conversation">
          <div className="h-56 w-full max-w-md overflow-hidden rounded-lg border">
            <Conversation>
              <ConversationContent>
                <ConversationItem>
                  <ConversationEmptyState title="Conversation empty state" description="Shown before messages arrive." />
                </ConversationItem>
              </ConversationContent>
            </Conversation>
          </div>
        </DebugRow>

        <DebugRow title="message">
          <div className="w-full max-w-md space-y-4 rounded-lg border p-4">
            <Message from="user"><MessageContent>Add project search.</MessageContent></Message>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{'I will inspect the project list and add search.\n\n- Read files\n- Add tests'}</MessageResponse>
              </MessageContent>
              <MessageToolbar><Button size="xs" variant="ghost">Copy</Button></MessageToolbar>
            </Message>
          </div>
        </DebugRow>

        <DebugRow title="model-selector">
          <ModelSelector>
            <ModelSelectorTrigger render={<Button variant="outline" />}>Choose model</ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>No model found.</ModelSelectorEmpty>
                <ModelSelectorGroup heading="Anthropic">
                  <ModelSelectorItem value="sonnet">
                    <ModelSelectorLogo provider="anthropic" />
                    <ModelSelectorName>Claude Sonnet</ModelSelectorName>
                    <ModelSelectorShortcut>Default</ModelSelectorShortcut>
                  </ModelSelectorItem>
                </ModelSelectorGroup>
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </DebugRow>

        <DebugRow title="prompt-input">
          <PromptInput className="max-w-md" onSubmit={() => undefined}>
            <PromptInputTextarea placeholder="Ask follow-up..." />
            <PromptInputFooter>
              <PromptInputTools><PromptInputAddAttachmentButton variant="ghost" /></PromptInputTools>
              <PromptInputSubmit />
            </PromptInputFooter>
          </PromptInput>
        </DebugRow>

        <DebugRow title="reasoning">
          <Reasoning defaultOpen duration={7} className="w-full max-w-md">
            <ReasoningTrigger />
            <ReasoningContent>{'I need to inspect the project structure before editing.'}</ReasoningContent>
          </Reasoning>
        </DebugRow>

        <DebugRow title="tool">
          <Tool defaultOpen className="max-w-md">
            <ToolHeader type="tool-read" title="Read file" state="output-available" />
            <ToolContent>
              <ToolInput input={{ path: 'src/features/projects/renderer/project-list.tsx' }} />
              <ToolOutput output={{ ok: true, lines: 120 }} />
            </ToolContent>
          </Tool>
          <ToolStatusBadge state="approval-requested" />
          <ToolStatusBadge state="output-error" />
        </DebugRow>

    </div>
  )
}

function TypographyDebugContent(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <DebugRow title="heading">
        <div className="space-y-2">
          <Heading as="h1" level="h1">Workspace heading</Heading>
          <Heading as="h2" level="h2">Surface heading</Heading>
          <Heading as="h3" level="h3">Panel heading</Heading>
          <Heading as="h4" level="h4">Section heading</Heading>
          <Heading as="h5" level="h5">Eyebrow heading</Heading>
        </div>
      </DebugRow>
      <DebugRow title="text">
        <div className="max-w-xl space-y-2">
          <Text>
            Space Zero is an agent-first workspace for builders. Body text should be readable,
            compact, and calm.
          </Text>
          <Text variant="muted">
            Muted text is useful for descriptions that should not compete with primary content.
          </Text>
          <Text variant="small">Small text is for dense rows and secondary labels.</Text>
          <Text variant="subtle">Subtle text is for metadata and low-emphasis helper copy.</Text>
          <Text variant="meta">Updated 2 minutes ago · 3 files changed</Text>
          <Text variant="danger">Destructive or failed state text.</Text>
        </div>
      </DebugRow>
      <DebugRow title="inline code">
        <Text>
          Run <CodeText>pnpm typecheck</CodeText> before committing.
        </Text>
      </DebugRow>
      <DebugRow title="keyboard">
        <div className="flex items-center gap-2">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <Text as="span" variant="subtle">Open command palette</Text>
        </div>
      </DebugRow>
      <DebugRow title="code block">
        <pre className="rounded-md bg-muted px-3 py-2 font-mono text-xs">
          pnpm typecheck --filter spacezero
        </pre>
      </DebugRow>
    </div>
  )
}

function ComponentsDebugContent(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <DebugRow title="settings-page-header">
        <SettingsPageHeader
          title="Appearance"
          description="Configure the theme, typography, and interface density."
        />
      </DebugRow>
      <DebugRow title="settings-section">
        <div className="w-full max-w-2xl">
          <SettingsSection
            title="Theme"
            description="Choose how Space Zero surfaces should look while you work."
            footer={<Text variant="subtle">Changes apply immediately in the app preview.</Text>}
          >
            <SettingsRow title="Theme" description="Choose between light, dark, and high contrast themes.">
              <Select defaultValue="dark">
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="dark-high-contrast">Dark high contrast</SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>
            <SettingsRow title="Use thin font anti-aliasing" description="Preview thinner browser-style font rendering.">
              <Switch size="sm" />
            </SettingsRow>
          </SettingsSection>
        </div>
      </DebugRow>
      <DebugRow title="empty-state">
        <EmptyState
          className="w-full max-w-md rounded-lg bg-card"
          icon={<FileText />}
          title="No agent work yet"
          description="Start an agent session to see messages, tool calls, changed files, and results here."
          actions={<Button size="sm">Start session</Button>}
        />
      </DebugRow>
      <DebugRow title="status row">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="secondary">Running</Badge>
          <Text as="span" variant="muted">Inspecting project files…</Text>
        </div>
      </DebugRow>
    </div>
  )
}

function DebugTabButton({
  active,
  children,
  onClick
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function DebugRow({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="grid gap-4 py-4 text-card-foreground lg:grid-cols-[180px_1fr]">
      <div>
        <h3 className="font-mono text-sm font-medium">{title}</h3>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}
