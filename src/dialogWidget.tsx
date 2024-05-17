import * as React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { generateUuid } from './uuid';
import Enumerable from 'linq';

export interface IAskDialogOptions {
  body: string;
  subBody1: string;
  subBody2: string;
  ok: string;
  cancel: string;
}

// ダイアログ
export function DialogUnit({
  id,
  options,
  onOk,
  onCancel
}: {
  id: string;
  options: IAskDialogOptions;
  onOk: (id: string) => void;
  onCancel: (id: string) => void;
}): JSX.Element {
  return (
    <div>
      <div className="nbwhisper-overlay nbwhisper-frontmost">
        <div className="nbwhisper-dialog-base">
          {options.body !== '' && (
            <div className="nbwhisper-dialog-body">{options.body}</div>
          )}
          {options.subBody1 !== '' && (
            <div className="nbwhisper-dialog-subbody">{options.subBody1}</div>
          )}
          {options.subBody2 !== '' && (
            <div className="nbwhisper-dialog-subbody">{options.subBody2}</div>
          )}
          <div className="nbwhisper-dialog-buttons">
            {options.cancel !== '' && (
              <div
                className={'nbwhisper-button nbwhisper-button-cancel'}
                onClick={() => onCancel(id)}
              >
                <span>{options.cancel}</span>
              </div>
            )}
            {options.ok !== '' && (
              <div
                className={'nbwhisper-button nbwhisper-button-normal'}
                onClick={() => onOk(id)}
              >
                <span>{options.ok}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface IDialogUnitParam {
  id: string;
  options: IAskDialogOptions;
}

// ダイアログ類
export class DialogWidget extends ReactWidget {
  private _dialogUnits: IDialogUnitParam[] = [];
  private _resolves: { [id: string]: any } = {};

  constructor() {
    super();
  }

  public showAskDialog(options: IAskDialogOptions) {
    const id = generateUuid();
    this._dialogUnits.push({
      id: id,
      options: options
    });
    this.update();
    return new Promise<boolean>(resolve => {
      this._resolves[id] = resolve;
    });
  }

  private _onOk(id: string) {
    this._deside(id, true);
  }

  private _onCancel(id: string) {
    this._deside(id, false);
  }

  private _deside(id: string, isOk: boolean) {
    const remove = Enumerable.from(this._dialogUnits)
      .where(d => d.id === id)
      .firstOrDefault();
    if (remove) {
      const removeIndex = this._dialogUnits.indexOf(remove);
      this._dialogUnits.splice(removeIndex, 1);
      this.update();
      if (id in this._resolves) {
        this._resolves[id](isOk);
        delete this._resolves[id];
      }
    }
  }

  render(): JSX.Element {
    return (
      <div>
        {this._dialogUnits.map(x => (
          <DialogUnit
            key={x.id}
            id={x.id}
            options={x.options}
            onOk={id => this._onOk(id)}
            onCancel={id => this._onCancel(id)}
          />
        ))}
      </div>
    );
  }
}
