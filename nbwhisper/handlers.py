import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from .soraHandlers import CreateAccessTokenHandler, PushChannelHandler
from .config import NBWhisper
import tornado, os

class ConfigHandler(APIHandler):
    def initialize(self, config):
        self._config = config
    
    @tornado.web.authenticated
    def get(self):
        username = self._config.default_username
        if 'JUPYTERHUB_USER' in os.environ:
            username = os.environ['JUPYTERHUB_USER']
        self.finish(json.dumps({
            "username": username,
            "api_key": self._config.api_key,
            "signaling_url": self._config.signaling_url,
            "channel_id_prefix": self._config.channel_id_prefix,
            "channel_id_suffix": self._config.channel_id_suffix,
            "share_current_tab_only": self._config.share_current_tab_only
        }))

class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            "data": "This is /nbwhisper/get-example endpoint!"
        }))

def get_api_handlers(parent_app, base_dir):
    config = NBWhisper(parent=parent_app)
    handler_settings = {}
    handler_settings['config'] = config

    return [
        ("get-example", RouteHandler, {}),
        ("config", ConfigHandler, handler_settings),
        ("create-access-token", CreateAccessTokenHandler, {}),
        ("push-channel", PushChannelHandler, {})
    ]

def setup_handlers(server_app, web_app):
    api_handlers = get_api_handlers(server_app, server_app.notebook_dir)
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    handlers = [(url_path_join(base_url, "nbwhisper", path), handler, options)
                for path, handler, options in api_handlers]
    web_app.add_handlers(host_pattern, handlers)
