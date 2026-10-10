import html
from pathlib import Path
from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util.docutils import SphinxDirective
from sphinx.util.fileutil import copy_asset
from sphinx.util.osutil import relative_uri


class noisemonitor_node(nodes.General, nodes.Element):
    pass


def visit_noisemonitor_html(self, node):
    threshold = node.get("threshold", 60)
    image_min = node.get("image_min", 0)
    image_max = node.get("image_max", 100)

    # Default messages tailored for a junior science classroom
    default_msgs = [
        "Level 0 - Great focus! Keep up the quiet work.",
        "Level 1 - Acceptable lab voices. Keep it down.",
        "Level 2 - Warning: Too noisy! Lower your voices.",
        "Level 3 - Consequence: List 3 types of variables.",
        "Level 4 - Consequence: Define the 3 types of variables.",
        "Level 5 - Consequence: Write out the patterns for an aim, hypothesis and trend.",
    ]

    # Retrieve and HTML-escape custom messages
    custom_msgs = [
        html.escape(node.get(f"msg{i}", default_msgs[i])) for i in range(6)
    ]

    # Resolve image paths relative to the current doc page
    docname = self.builder.current_docname
    base_uri = self.builder.get_target_uri(docname)
    noise_images = [
        relative_uri(base_uri, f"_static/noise{i}.png") for i in range(6)
    ]

    image_data_attrs = " ".join(f'data-img{i}="{html.escape(src)}"'
                                for i, src in enumerate(noise_images))
    msg_data_attrs = " ".join(f'data-msg{i}="{msg}"'
                              for i, msg in enumerate(custom_msgs))

    # Generate custom message input fields with explicit label/id associations
    msg_inputs_html = "\n".join(f"""
        <div class="noise-control-group">
            <label for="msg-input-{i}">Level {i} Message:</label>
            <input type="text" id="msg-input-{i}" class="noise-msg-input" data-level="{i}" value="{msg}">
        </div>""" for i, msg in enumerate(custom_msgs))

    html_out = f"""
    <div class="noise-monitor-card" data-threshold="{threshold}" data-image-min="{image_min}" data-image-max="{image_max}" {image_data_attrs} {msg_data_attrs}>

        <!-- Hero Section -->
        <div class="noise-hero-section">
            <div class="noise-hero-content">
                <div class="noise-monitor-controls">
                    <button type="button" class="noise-btn-toggle">Start Mic Monitor</button>
                </div>

                <!-- Image placed in foreground between button and title/message, sized to 60% -->
                <div class="noise-foreground-image-container">
                    <img class="noise-image" src="{noise_images[0]}" alt="Noise level indicator">
                </div>

                <div class="noise-monitor-header">
                    <h3>🔊 Noise Level Monitor</h3>
                </div>

                <div class="noise-monitor-body">
                    <!-- 48px Level Message Display -->
                    <div class="noise-readout_message">
                        <p class="noise-level-message">{custom_msgs[0]}</p>
                    </div>

                    <!-- Meter Bar (Own Row) -->
                    <div class="noise-meter-container">
                        <div class="noise-meter-bar"></div>
                    </div>

                    <!-- dB Level and Status Row -->
                    <div class="noise-meter-row">
                        <div class="noise-readout_level">
                            <span class="noise-db-value">0</span> dB
                        </div>

                        <div class="noise-readout">
                            <p class="noise-status-text">Monitoring ambient sound...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Settings Panel -->
        <div class="noise-settings-panel">
            <h4>Settings & Controls</h4>

            <div class="noise-control-group">
                <label for="slider-threshold">Threshold Level: <span class="noise-slider-val-threshold">{threshold}</span> dB</label>
                <input type="range" id="slider-threshold" class="noise-slider-threshold" min="0" max="100" value="{threshold}">
            </div>

            <div class="noise-control-group">
                <label for="slider-min">Min Level: <span class="noise-slider-val-min">{image_min}</span> dB</label>
                <input type="range" id="slider-min" class="noise-slider-min" min="0" max="100" value="{image_min}">
            </div>

            <div class="noise-control-group">
                <label for="slider-max">Max Level: <span class="noise-slider-val-max">{image_max}</span> dB</label>
                <input type="range" id="slider-max" class="noise-slider-max" min="0" max="100" value="{image_max}">
            </div>

            <h4>Custom Level Messages</h4>
            {msg_inputs_html}
        </div>
    </div>
    """
    self.body.append(html_out)


def depart_noisemonitor_html(self, node):
    pass


class NoiseMonitorDirective(SphinxDirective):
    has_content = False

    option_spec = {
        "threshold": directives.nonnegative_int,
        "image-min": directives.nonnegative_int,
        "image-max": directives.nonnegative_int,
        "msg0": directives.unchanged,
        "msg1": directives.unchanged,
        "msg2": directives.unchanged,
        "msg3": directives.unchanged,
        "msg4": directives.unchanged,
        "msg5": directives.unchanged,
    }

    def run(self):
        node = noisemonitor_node()
        node["threshold"] = self.options.get("threshold", 60)

        image_min = self.options.get("image-min", 0)
        image_max = self.options.get("image-max", 100)

        if image_max <= image_min:
            self.state_machine.reporter.warning(
                f"noisemonitor: image-max ({image_max}) must be greater "
                f"than image-min ({image_min}); falling back to 0-100.",
                line=self.lineno,
            )
            image_min, image_max = 0, 100

        node["image_min"] = image_min
        node["image_max"] = image_max

        for i in range(6):
            if f"msg{i}" in self.options:
                node[f"msg{i}"] = self.options[f"msg{i}"]

        return [node]


def copy_static_assets(app, exception):
    """Copies static assets to the build output directory."""
    if app.builder.name == "html" and exception is None:
        ext_static = Path(__file__).parent / "_static"
        out_static = Path(app.outdir) / "_static"

        if ext_static.exists():
            copy_asset(str(ext_static), str(out_static))


def setup(app):
    app.add_node(
        noisemonitor_node,
        html=(visit_noisemonitor_html, depart_noisemonitor_html),
    )
    app.add_directive("noisemonitor", NoiseMonitorDirective)

    app.add_js_file("noisemonitor.js")
    app.add_css_file("noisemonitor.css")

    app.connect("build-finished", copy_static_assets)

    return {
        "version": "1.0",
        "parallel_read_safe": True,
        "parallel_write_safe": True,
    }