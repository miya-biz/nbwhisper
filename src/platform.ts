import { JupyterFrontEnd } from '@jupyterlab/application';
import { TabPanel, Widget } from '@lumino/widgets';

export enum PlatformType {
  JUPYTER_LAB,
  JUPYTER_NOTEBOOK7_EDITOR,
  JUPYTER_NOTEBOOK7_TREE
}

export type Notebook7TreePanels = {
  tree: TabPanel;
};

export type Platform = {
  type: PlatformType;
  notebook7TreePanels?: Notebook7TreePanels;
};

function findChildWidgetById(widget: Widget, id: string): Widget | null {
  if (widget.id === id) {
    return widget;
  }
  let result: Widget | null = null;
  for (const child of widget.children()) {
    result = findChildWidgetById(child, id);
    if (result) {
      break;
    }
  }
  return result;
}

function checkPlatform(
  app: JupyterFrontEnd,
  callback: (platform: Platform) => void
) {
  const widgets = Array.from(app.shell.widgets('main'));
  if (widgets.length === 0) {
    setTimeout(() => {
      checkPlatform(app, callback);
    }, 10);
    return;
  }

  const tab = widgets[0] as TabPanel;

  let type = PlatformType.JUPYTER_NOTEBOOK7_TREE;
  if (!tab.addWidget) {
    // lab or notebook7の編集画面
    const bottomWidgets = Array.from(app.shell.widgets('bottom'));
    type =
      bottomWidgets.length > 0 &&
      findChildWidgetById(bottomWidgets[0], 'jp-main-statusbar')
        ? PlatformType.JUPYTER_LAB
        : PlatformType.JUPYTER_NOTEBOOK7_EDITOR;
  }

  const platform: Platform = {
    type
  };
  if (type === PlatformType.JUPYTER_NOTEBOOK7_TREE) {
    platform.notebook7TreePanels = {
      tree: tab
    };
  }
  callback(platform);
}

export function getPlatform(app: JupyterFrontEnd): Promise<Platform> {
  return new Promise<Platform>((resolve, reject) => {
    checkPlatform(app, platform => {
      resolve(platform);
    });
  });
}
