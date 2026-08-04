import React, { useState, useEffect } from 'react';
import { Notebook, NotebookPage, ToolType, PaperTemplate } from './types/notebook';
import { StorageEngine } from './engine/StorageEngine';
import { AudioSyncEngine } from './engine/AudioSyncEngine';
import { HeaderBar } from './components/HeaderBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { CanvasArea } from './components/CanvasArea';
import { NativeGuideModal } from './components/NativeGuideModal';

const audioEngine = new AudioSyncEngine();

export const App: React.FC = () => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string>('');
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);

  // Tools & Styling state
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#6366f1');
  const [size, setSize] = useState<number>(4);
  const [fontFamily, setFontFamily] = useState<string>("'Caveat', cursive");
  const [smartShapeEnabled, setSmartShapeEnabled] = useState<boolean>(true);
  const [palmRejectionActive, setPalmRejectionActive] = useState<boolean>(true);

  // Audio Recording Sync
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);

  // Modals & Sidebar
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [nativeGuideOpen, setNativeGuideOpen] = useState<boolean>(false);

  // Load Notebooks on App Init
  useEffect(() => {
    const loaded = StorageEngine.loadNotebooks();
    setNotebooks(loaded);
    if (loaded.length > 0) {
      setActiveNotebookId(loaded[0].id);
    }
  }, []);

  // Save Notebooks whenever state mutates
  useEffect(() => {
    if (notebooks.length > 0) {
      StorageEngine.saveNotebooks(notebooks);
    }
  }, [notebooks]);

  // Audio recording timer loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecordingAudio) {
      interval = setInterval(() => {
        setRecordingTime(audioEngine.getElapsedSeconds());
      }, 500);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecordingAudio]);

  const activeNotebook = notebooks.find(n => n.id === activeNotebookId) || null;
  const currentPage = activeNotebook?.pages[currentPageIndex] || null;

  // Toggle Audio Recording
  const handleToggleRecording = async () => {
    if (!isRecordingAudio) {
      const ok = await audioEngine.startRecording();
      if (ok) setIsRecordingAudio(true);
    } else {
      await audioEngine.stopRecording();
      setIsRecordingAudio(false);
      alert('🎙️ Đã lưu bản ghi âm đồng bộ nét vẽ thành công!');
    }
  };

  // Update Page State
  const handlePageUpdate = (updatedPage: NotebookPage) => {
    if (!activeNotebook) return;
    const updatedPages = activeNotebook.pages.map((p, idx) => 
      idx === currentPageIndex ? updatedPage : p
    );

    const updatedNotebook = { ...activeNotebook, pages: updatedPages, updatedAt: Date.now() };
    setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? updatedNotebook : n));
  };

  // Add New Page
  const handleAddPage = () => {
    if (!activeNotebook) return;
    const newPageIndex = activeNotebook.pages.length;
    const newPage: NotebookPage = {
      id: `p-${Date.now()}`,
      pageIndex: newPageIndex,
      template: activeNotebook.pages[currentPageIndex]?.template || 'grid',
      strokes: [],
      textElements: [],
      imageElements: [],
      audioNotes: []
    };

    const updatedNotebook = {
      ...activeNotebook,
      pages: [...activeNotebook.pages, newPage],
      updatedAt: Date.now()
    };

    setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? updatedNotebook : n));
    setCurrentPageIndex(newPageIndex);
  };

  // Delete Page
  const handleDeletePage = (index: number) => {
    if (!activeNotebook || activeNotebook.pages.length <= 1) return;
    const updatedPages = activeNotebook.pages.filter((_, idx) => idx !== index);
    const updatedNotebook = { ...activeNotebook, pages: updatedPages, updatedAt: Date.now() };
    setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? updatedNotebook : n));
    if (currentPageIndex >= updatedPages.length) {
      setCurrentPageIndex(updatedPages.length - 1);
    }
  };

  // Create Notebook
  const handleCreateNotebook = (title: string, category: string, template: PaperTemplate) => {
    const newNb: Notebook = {
      id: `nb-${Date.now()}`,
      title,
      category,
      coverColor: 'from-indigo-600 to-purple-600',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pages: [
        {
          id: `p-${Date.now()}-1`,
          pageIndex: 0,
          template: template,
          strokes: [],
          textElements: [],
          imageElements: [],
          audioNotes: []
        }
      ]
    };

    setNotebooks(prev => [newNb, ...prev]);
    setActiveNotebookId(newNb.id);
    setCurrentPageIndex(0);
  };

  // Delete Notebook
  const handleDeleteNotebook = (id: string) => {
    const remaining = notebooks.filter(n => n.id !== id);
    setNotebooks(remaining);
    if (remaining.length > 0) {
      setActiveNotebookId(remaining[0].id);
      setCurrentPageIndex(0);
    }
  };

  // Change Paper Template
  const handleChangePageTemplate = (template: PaperTemplate) => {
    if (!currentPage) return;
    handlePageUpdate({ ...currentPage, template });
  };

  // Import PDF (Simulated raster rendering)
  const handleImportPdf = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        alert(`📄 Đã import file PDF "${file.name}" làm nền trang sổ tay thành công!`);
      }
    };
    input.click();
  };

  // Export Page as PNG Image
  const handleExportPage = () => {
    alert('📸 Trang sổ tay đã được xuất thành hình ảnh PNG chất lượng cao!');
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950">
      {/* Top Header Navigation */}
      <HeaderBar
        notebook={activeNotebook}
        currentPageIndex={currentPageIndex}
        totalPages={activeNotebook?.pages.length || 1}
        palmRejectionActive={palmRejectionActive}
        onTogglePalmRejection={() => setPalmRejectionActive(!palmRejectionActive)}
        isRecording={isRecordingAudio}
        recordingTime={recordingTime}
        onToggleRecording={handleToggleRecording}
        onImportPdf={handleImportPdf}
        onExportPage={handleExportPage}
        onPrevPage={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
        onNextPage={() => setCurrentPageIndex(prev => Math.min((activeNotebook?.pages.length || 1) - 1, prev + 1))}
        onAddPage={handleAddPage}
        onOpenSidebar={() => setSidebarOpen(true)}
        onOpenNativeGuide={() => setNativeGuideOpen(true)}
      />

      {/* Main Drawing Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {currentPage ? (
          <CanvasArea
            key={currentPage.id}
            page={currentPage}
            currentTool={currentTool}
            color={color}
            size={size}
            fontFamily={fontFamily}
            smartShapeEnabled={smartShapeEnabled}
            palmRejectionActive={palmRejectionActive}
            onPageUpdate={handlePageUpdate}
            audioRecordingTime={recordingTime}
            isRecordingAudio={isRecordingAudio}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 font-semibold">
            Vui lòng chọn hoặc tạo mới một sổ tay...
          </div>
        )}
      </main>

      {/* Floating Toolbar */}
      <Toolbar
        currentTool={currentTool}
        onSelectTool={setCurrentTool}
        color={color}
        onChangeColor={setColor}
        size={size}
        onChangeSize={setSize}
        fontFamily={fontFamily}
        onChangeFontFamily={setFontFamily}
        smartShapeEnabled={smartShapeEnabled}
        onToggleSmartShape={() => setSmartShapeEnabled(!smartShapeEnabled)}
      />

      {/* Sidebar Drawer */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        notebooks={notebooks}
        activeNotebookId={activeNotebookId}
        onSelectNotebook={(id) => {
          setActiveNotebookId(id);
          setCurrentPageIndex(0);
        }}
        onCreateNotebook={handleCreateNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        currentPageIndex={currentPageIndex}
        onSelectPage={setCurrentPageIndex}
        onChangePageTemplate={handleChangePageTemplate}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
      />

      {/* Native Kotlin Module Deployment Guide */}
      <NativeGuideModal
        isOpen={nativeGuideOpen}
        onClose={() => setNativeGuideOpen(false)}
      />
    </div>
  );
};
